use serde::Serialize;
use serde_json;
use valico::json_schema;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct ValidationResult {
    valid: bool,
    line: Option<u32>,
    column: Option<u32>,
    end_line: Option<u32>,
    end_column: Option<u32>,
    message: Option<String>,
}

#[derive(Serialize)]
struct SchemaError {
    path: String,
    message: String,
}

#[derive(Serialize)]
struct SchemaValidationResult {
    valid: bool,
    errors: Vec<SchemaError>,
}

#[wasm_bindgen]
pub fn validate_toml(content: &str) -> String {
    let result = toml::from_str::<toml::Value>(content);
    let index = LineIndex::new(content);

    let validation = match result {
        Ok(_) => ValidationResult {
            valid: true,
            line: None,
            column: None,
            end_line: None,
            end_column: None,
            message: None,
        },
        Err(error) => {
            let (start_line, start_col, end_line, end_col) = if let Some(range) = error.span() {
                let mut start_offset = range.start;
                let mut end_offset = range.end;

                while start_offset > 0 {
                    let prev = content[..start_offset]
                        .char_indices()
                        .last()
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    let c = content[prev..].chars().next().unwrap();
                    if c.is_whitespace()
                        || c == '='
                        || c == '['
                        || c == '{'
                        || c == ','
                        || c == '"'
                        || c == '\''
                    {
                        break;
                    }
                    start_offset = prev;
                }
                while end_offset < content.len() {
                    let c = content[end_offset..].chars().next().unwrap();
                    if c.is_whitespace()
                        || c == '#'
                        || c == ']'
                        || c == '}'
                        || c == ','
                        || c == '"'
                        || c == '\''
                    {
                        break;
                    }
                    end_offset += c.len_utf8();
                }

                let start = index.coords(start_offset, content);
                let end = index.coords(end_offset, content);
                (Some(start.0), Some(start.1), Some(end.0), Some(end.1))
            } else {
                (None, None, None, None)
            };

            ValidationResult {
                valid: false,
                line: start_line,
                column: start_col,
                end_line,
                end_column: end_col,
                message: Some(error.to_string()),
            }
        }
    };

    serde_json::to_string(&validation).unwrap()
}

struct LineIndex {
    line_starts: Vec<usize>,
}

impl LineIndex {
    fn new(text: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, c) in text.char_indices() {
            if c == '\n' {
                line_starts.push(i + 1);
            }
        }
        Self { line_starts }
    }

    fn coords(&self, offset: usize, content: &str) -> (u32, u32) {
        let line = match self.line_starts.binary_search(&offset) {
            Ok(idx) => idx,
            Err(idx) => idx - 1,
        };
        let line_start = self.line_starts[line];
        let col = content[line_start..offset].chars().count();
        (line as u32, col as u32)
    }
}

#[wasm_bindgen]
pub fn validate_with_schema(toml_content: &str, json_schema: &str) -> String {
    let toml_value = match toml::from_str::<toml::Value>(toml_content) {
        Ok(v) => v,
        Err(_) => {
            return serde_json::to_string(&SchemaValidationResult {
                valid: false,
                errors: vec![SchemaError {
                    path: String::from("root"),
                    message: String::from("Invalid TOML syntax"),
                }],
            })
            .unwrap();
        }
    };

    let json_value = serde_json::to_value(toml_value).unwrap();
    let mut schema_json: serde_json::Value = serde_json::from_str(json_schema).unwrap();

    // Sanitize the schema before compiling
    sanitize_json(&mut schema_json);

    let mut scope = json_schema::Scope::new();
    let schema = match scope.compile_and_return(schema_json, false) {
        Ok(s) => s,
        Err(e) => {
            return serde_json::to_string(&SchemaValidationResult {
                valid: false,
                errors: vec![SchemaError {
                    path: String::from("schema"),
                    message: format!("Invalid JSON Schema: {:?}", e),
                }],
            })
            .unwrap();
        }
    };

    let validation = schema.validate(&json_value);
    let is_valid = validation.is_valid();

    let mut errors_vec = Vec::new();
    if !is_valid {
        for error in validation.errors {
            errors_vec.push(SchemaError {
                path: error.get_path().to_string(),
                message: error.get_title().to_string(),
            });
        }
    }

    let result = SchemaValidationResult {
        valid: is_valid,
        errors: errors_vec,
    };

    serde_json::to_string(&result).unwrap()
}

#[cfg(test)]
mod tests {}
fn sanitize_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(obj) => {
            // Remove keys starting with x-
            obj.retain(|key, _| !key.starts_with("x-"));
            // Recursively sanitize
            for (_, val) in obj.iter_mut() {
                sanitize_json(val);
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr.iter_mut() {
                sanitize_json(val);
            }
        }
        _ => {}
    }
}
