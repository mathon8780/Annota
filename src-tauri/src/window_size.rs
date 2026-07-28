use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf};

const SIZE_FILE_NAME: &str = "window-size.json";
const SESSION_MARKER_FILE_NAME: &str = "window-session-running";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WindowDimensions {
    pub(crate) width: f64,
    pub(crate) height: f64,
}

impl WindowDimensions {
    pub(crate) const DEFAULT: Self = Self {
        width: 1280.0,
        height: 720.0,
    };
    const MIN_WIDTH: f64 = 980.0;
    const MIN_HEIGHT: f64 = 640.0;

    fn is_valid(self) -> bool {
        self.width.is_finite()
            && self.height.is_finite()
            && self.width >= Self::MIN_WIDTH
            && self.height >= Self::MIN_HEIGHT
    }
}

#[derive(Deserialize, Serialize)]
struct WindowSizeRecord {
    version: u8,
    width: f64,
    height: f64,
}

pub(crate) struct WindowSizePersistence {
    directory: PathBuf,
}

impl WindowSizePersistence {
    pub(crate) fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub(crate) fn begin_session(&self) -> WindowDimensions {
        let marker_path = self.directory.join(SESSION_MARKER_FILE_NAME);
        let previous_session_was_abnormal = marker_path.exists();
        let dimensions = if previous_session_was_abnormal {
            WindowDimensions::DEFAULT
        } else {
            self.read_dimensions().unwrap_or(WindowDimensions::DEFAULT)
        };

        let marker_result = fs::create_dir_all(&self.directory)
            .and_then(|_| fs::write(marker_path, std::process::id().to_string()));

        if marker_result.is_ok() {
            dimensions
        } else {
            WindowDimensions::DEFAULT
        }
    }

    pub(crate) fn finish_session(&self, dimensions: WindowDimensions) -> io::Result<()> {
        if !dimensions.is_valid() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "window dimensions are invalid",
            ));
        }

        fs::create_dir_all(&self.directory)?;
        let record = WindowSizeRecord {
            version: 1,
            width: dimensions.width,
            height: dimensions.height,
        };
        let contents = serde_json::to_vec(&record).map_err(io::Error::other)?;
        fs::write(self.directory.join(SIZE_FILE_NAME), contents)?;

        match fs::remove_file(self.directory.join(SESSION_MARKER_FILE_NAME)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn read_dimensions(&self) -> Option<WindowDimensions> {
        let contents = fs::read(self.directory.join(SIZE_FILE_NAME)).ok()?;
        let record = serde_json::from_slice::<WindowSizeRecord>(&contents).ok()?;
        let dimensions = WindowDimensions {
            width: record.width,
            height: record.height,
        };

        (record.version == 1 && dimensions.is_valid()).then_some(dimensions)
    }
}

#[cfg(test)]
mod tests {
    use super::{WindowDimensions, WindowSizePersistence};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "annota-window-size-{name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn restores_saved_dimensions_after_a_clean_session() {
        let directory = TestDirectory::new("restore");
        fs::write(
            directory.path().join("window-size.json"),
            r#"{"version":1,"width":1440.0,"height":900.0}"#,
        )
        .expect("saved dimensions should be written");
        let persistence = WindowSizePersistence::new(directory.path().to_path_buf());

        assert_eq!(
            persistence.begin_session(),
            WindowDimensions {
                width: 1440.0,
                height: 900.0,
            }
        );
        assert!(directory.path().join("window-session-running").exists());
    }

    #[test]
    fn uses_default_dimensions_after_an_abnormal_session() {
        let directory = TestDirectory::new("abnormal");
        fs::write(
            directory.path().join("window-size.json"),
            r#"{"version":1,"width":1440.0,"height":900.0}"#,
        )
        .expect("saved dimensions should be written");
        fs::write(directory.path().join("window-session-running"), b"running")
            .expect("stale marker should be written");
        let persistence = WindowSizePersistence::new(directory.path().to_path_buf());

        assert_eq!(persistence.begin_session(), WindowDimensions::DEFAULT);
    }

    #[test]
    fn uses_default_dimensions_for_a_malformed_record() {
        let directory = TestDirectory::new("malformed");
        fs::write(
            directory.path().join("window-size.json"),
            br#"{"version":1,"width":"large","height":900.0}"#,
        )
        .expect("malformed dimensions should be written");
        let persistence = WindowSizePersistence::new(directory.path().to_path_buf());

        assert_eq!(persistence.begin_session(), WindowDimensions::DEFAULT);
    }

    #[test]
    fn normal_close_saves_dimensions_and_clears_the_running_marker() {
        let directory = TestDirectory::new("finish");
        let persistence = WindowSizePersistence::new(directory.path().to_path_buf());
        let _ = persistence.begin_session();

        persistence
            .finish_session(WindowDimensions {
                width: 1360.0,
                height: 768.0,
            })
            .expect("normal close should persist dimensions");

        let record = fs::read_to_string(directory.path().join("window-size.json"))
            .expect("saved dimensions should be readable");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&record)
                .expect("saved dimensions should be JSON"),
            serde_json::json!({
                "version": 1,
                "width": 1360.0,
                "height": 768.0,
            })
        );
        assert!(!directory.path().join("window-session-running").exists());
    }

    #[test]
    fn failed_normal_close_keeps_the_running_marker() {
        let directory = TestDirectory::new("finish-failure");
        let persistence = WindowSizePersistence::new(directory.path().to_path_buf());
        let _ = persistence.begin_session();
        fs::create_dir(directory.path().join("window-size.json"))
            .expect("a directory should block the size file write");

        let result = persistence.finish_session(WindowDimensions {
            width: 1360.0,
            height: 768.0,
        });

        assert!(result.is_err());
        assert!(directory.path().join("window-session-running").exists());
    }
}
