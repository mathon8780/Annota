mod markdown_store;
mod window_size;

use markdown_store::{MarkdownDocument, MarkdownStore};
use tauri::{LogicalSize, Manager, WindowEvent};
use window_size::{WindowDimensions, WindowSizePersistence};

#[cfg(windows)]
fn system_font_families() -> Result<Vec<String>, String> {
    use std::collections::BTreeMap;
    use windows::core::{w, BOOL};
    use windows::Win32::Graphics::DirectWrite::{
        DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection, IDWriteLocalizedStrings,
        DWRITE_FACTORY_TYPE_SHARED,
    };

    fn localized_family_name(names: &IDWriteLocalizedStrings) -> Result<String, String> {
        let mut selected_index = 0;

        for locale in [w!("zh-cn"), w!("en-us")] {
            let mut locale_index = 0;
            let mut exists = BOOL::default();
            unsafe {
                names
                    .FindLocaleName(locale, &mut locale_index, &mut exists)
                    .map_err(|error| error.to_string())?;
            }
            if exists.as_bool() {
                selected_index = locale_index;
                break;
            }
        }

        let length = unsafe {
            names
                .GetStringLength(selected_index)
                .map_err(|error| error.to_string())?
        };
        let mut buffer = vec![0_u16; length as usize + 1];
        unsafe {
            names
                .GetString(selected_index, &mut buffer)
                .map_err(|error| error.to_string())?;
        }
        buffer.truncate(length as usize);
        String::from_utf16(&buffer).map_err(|error| error.to_string())
    }

    let factory: IDWriteFactory = unsafe {
        DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED).map_err(|error| error.to_string())?
    };
    let mut collection: Option<IDWriteFontCollection> = None;
    unsafe {
        factory
            .GetSystemFontCollection(&mut collection, false)
            .map_err(|error| error.to_string())?;
    }
    let collection = collection.ok_or_else(|| "Windows 未返回系统字体集合".to_string())?;
    let family_count = unsafe { collection.GetFontFamilyCount() };
    let mut families = BTreeMap::new();

    for index in 0..family_count {
        let family = unsafe {
            collection
                .GetFontFamily(index)
                .map_err(|error| error.to_string())?
        };
        let names = unsafe { family.GetFamilyNames().map_err(|error| error.to_string())? };
        let name = localized_family_name(&names)?;
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            families
                .entry(trimmed.to_lowercase())
                .or_insert_with(|| trimmed.to_string());
        }
    }

    Ok(families.into_values().collect())
}

#[cfg(not(windows))]
fn system_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    system_font_families()
}

#[tauri::command]
fn load_markdown_document(
    store: tauri::State<'_, MarkdownStore>,
    document_id: String,
    initial_content: String,
) -> Result<MarkdownDocument, String> {
    store.load_or_create(&document_id, &initial_content)
}

#[tauri::command]
fn save_markdown_document(
    store: tauri::State<'_, MarkdownStore>,
    document_id: String,
    content: String,
) -> Result<MarkdownDocument, String> {
    store.save(&document_id, &content)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelDiscoveryRequest {
    base_url: String,
    models_path: String,
    api_key: String,
    protocol: String,
}

fn model_list_url(base_url: &str, models_path: &str) -> Result<reqwest::Url, String> {
    let base_url = base_url.trim();
    let models_path = models_path.trim();
    let value = if models_path.starts_with("http://") || models_path.starts_with("https://") {
        models_path.to_string()
    } else {
        if base_url.is_empty() {
            return Err("请先填写 Base URL".to_string());
        }
        format!(
            "{}/{}",
            base_url.trim_end_matches('/'),
            models_path.trim_start_matches('/').trim().to_string()
        )
    };
    let value = if value.ends_with('/') && models_path.is_empty() {
        format!("{value}models")
    } else if models_path.is_empty() {
        format!("{value}/models")
    } else {
        value
    };
    let url = reqwest::Url::parse(&value).map_err(|error| format!("模型列表地址无效：{error}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("模型列表地址只支持 HTTP 或 HTTPS".to_string()),
    }
}

fn model_id(value: &serde_json::Value) -> Option<String> {
    if let Some(value) = value.as_str() {
        let value = value.trim().trim_start_matches("models/");
        return (!value.is_empty()).then(|| value.to_string());
    }
    for key in ["id", "baseModelId", "name", "model"] {
        if let Some(value) = value.get(key).and_then(serde_json::Value::as_str) {
            let value = value.trim().trim_start_matches("models/");
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn model_ids(payload: &serde_json::Value) -> Vec<String> {
    let values = payload
        .as_array()
        .or_else(|| payload.get("data").and_then(serde_json::Value::as_array))
        .or_else(|| payload.get("models").and_then(serde_json::Value::as_array));
    let mut models = values
        .into_iter()
        .flatten()
        .filter_map(model_id)
        .collect::<Vec<_>>();
    models.sort_by_key(|value| value.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    models
}

#[tauri::command]
async fn discover_models(request: ModelDiscoveryRequest) -> Result<Vec<String>, String> {
    use std::time::Duration;

    let url = model_list_url(&request.base_url, &request.models_path)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("无法创建模型列表请求：{error}"))?;
    let mut builder = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json");
    let api_key = request.api_key.trim();
    if !api_key.is_empty() {
        if request.protocol == "anthropic-messages" {
            builder = builder
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01");
        } else {
            builder = builder.bearer_auth(api_key);
        }
    }
    let response = builder
        .send()
        .await
        .map_err(|error| format!("无法访问模型列表：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取模型列表响应：{error}"))?;
    if !status.is_success() {
        let status_code = status.as_u16();
        if status_code == 401 || status_code == 403 {
            return Err(format!("鉴权失败（HTTP {status_code}），请检查 API Key"));
        }
        if status_code == 404 {
            return Err("没有找到模型列表接口（HTTP 404），请检查模型列表地址".to_string());
        }
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|payload| {
                payload
                    .pointer("/error/message")
                    .or_else(|| payload.get("message"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
            });
        return Err(match detail {
            Some(detail) => format!("模型列表接口返回 HTTP {status_code}：{detail}"),
            None => format!("模型列表接口返回 HTTP {status_code}"),
        });
    }
    let payload = serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|error| format!("模型列表不是有效的 JSON：{error}"))?;
    let models = model_ids(&payload);
    if models.is_empty() {
        return Err("模型列表接口没有返回可用的模型 ID".to_string());
    }
    Ok(models)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelGenerationRequest {
    base_url: String,
    endpoint_path: String,
    api_key: String,
    protocol: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
}

fn model_endpoint_url(base_url: &str, endpoint_path: &str) -> Result<reqwest::Url, String> {
    let base_url = base_url.trim();
    let endpoint_path = endpoint_path.trim();
    let value = if endpoint_path.starts_with("http://") || endpoint_path.starts_with("https://") {
        endpoint_path.to_string()
    } else {
        if base_url.is_empty() {
            return Err("模型服务缺少请求地址".to_string());
        }
        format!(
            "{}/{}",
            base_url.trim_end_matches('/'),
            endpoint_path.trim_start_matches('/').trim().to_string()
        )
    };
    let url = reqwest::Url::parse(&value).map_err(|error| format!("模型请求地址无效：{error}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("模型请求地址只支持 HTTP 或 HTTPS".to_string()),
    }
}

fn generated_text(payload: &serde_json::Value, protocol: &str) -> Option<String> {
    if protocol == "anthropic-messages" {
        return payload
            .get("content")
            .and_then(serde_json::Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
    }
    payload
        .pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[tauri::command]
async fn generate_text(request: ModelGenerationRequest) -> Result<String, String> {
    use std::time::Duration;

    if request.api_key.trim().is_empty() {
        return Err("所选模型没有配置 API Key".to_string());
    }
    if request.model.trim().is_empty() {
        return Err("生成类型没有选择可用模型".to_string());
    }

    let url = model_endpoint_url(&request.base_url, &request.endpoint_path)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建模型请求：{error}"))?;
    let mut builder = client.post(url);
    let body = if request.protocol == "anthropic-messages" {
        builder = builder
            .header("x-api-key", request.api_key.trim())
            .header("anthropic-version", "2023-06-01");
        serde_json::json!({
            "model": request.model,
            "max_tokens": 2400,
            "system": request.system_prompt,
            "messages": [{ "role": "user", "content": request.user_prompt }]
        })
    } else {
        builder = builder.bearer_auth(request.api_key.trim());
        serde_json::json!({
            "model": request.model,
            "messages": [
                { "role": "system", "content": request.system_prompt },
                { "role": "user", "content": request.user_prompt }
            ]
        })
    };
    let response = builder
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("无法访问模型服务：{error}"))?;
    let status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|error| format!("无法读取模型响应：{error}"))?;
    if !status.is_success() {
        let code = status.as_u16();
        if code == 401 || code == 403 {
            return Err(format!("鉴权失败（HTTP {code}），请检查 API Key"));
        }
        if code == 429 {
            return Err("模型服务请求过于频繁（HTTP 429），请稍后再试".to_string());
        }
        let detail = serde_json::from_str::<serde_json::Value>(&response_body)
            .ok()
            .and_then(|payload| {
                payload
                    .pointer("/error/message")
                    .or_else(|| payload.get("message"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
            });
        return Err(match detail {
            Some(detail) => format!("模型服务返回 HTTP {code}：{detail}"),
            None => format!("模型服务返回 HTTP {code}"),
        });
    }
    let payload = serde_json::from_str::<serde_json::Value>(&response_body)
        .map_err(|error| format!("模型响应不是有效的 JSON：{error}"))?;
    generated_text(&payload, &request.protocol)
        .ok_or_else(|| "模型服务没有返回可用内容".to_string())
}

#[cfg(all(test, windows))]
mod tests {
    use super::system_font_families;

    #[test]
    fn enumerates_installed_windows_font_families() {
        let families = system_font_families().expect("DirectWrite font enumeration should succeed");
        assert!(!families.is_empty());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_directory = app.path().app_data_dir();
            let persistence = match &app_data_directory {
                Ok(directory) => Some(WindowSizePersistence::new(directory.clone())),
                Err(error) => {
                    eprintln!("failed to resolve window state directory: {error}");
                    None
                }
            };
            let dimensions = persistence
                .as_ref()
                .map(WindowSizePersistence::begin_session)
                .unwrap_or(WindowDimensions::DEFAULT);

            if let Some(persistence) = persistence {
                app.manage(persistence);
            }
            if let Ok(directory) = app_data_directory {
                let markdown_store = MarkdownStore::new(directory);
                markdown_store
                    .apply_content_reset()
                    .map_err(std::io::Error::other)?;
                app.manage(markdown_store);
            }

            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) =
                    window.set_size(LogicalSize::new(dimensions.width, dimensions.height))
                {
                    eprintln!("failed to restore window size: {error}");
                }
                if let Err(error) = window.center() {
                    eprintln!("failed to center window: {error}");
                }
                window.show()?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" || !matches!(event, WindowEvent::CloseRequested { .. }) {
                return;
            }
            let Some(persistence) = window.app_handle().try_state::<WindowSizePersistence>() else {
                return;
            };

            let (physical_size, scale_factor) = match (window.inner_size(), window.scale_factor()) {
                (Ok(physical_size), Ok(scale_factor)) => (physical_size, scale_factor),
                (Err(error), _) | (_, Err(error)) => {
                    eprintln!("failed to read window size before closing: {error}");
                    return;
                }
            };
            let logical_size = physical_size.to_logical::<f64>(scale_factor);
            if let Err(error) = persistence.finish_session(WindowDimensions {
                width: logical_size.width,
                height: logical_size.height,
            }) {
                eprintln!("failed to persist window size: {error}");
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            load_markdown_document,
            save_markdown_document,
            discover_models,
            generate_text
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Annota");
}
