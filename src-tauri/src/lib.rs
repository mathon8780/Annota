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
        .invoke_handler(tauri::generate_handler![list_system_fonts])
        .run(tauri::generate_context!())
        .expect("failed to run Annota");
}
