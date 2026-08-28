use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct BoundingBox { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

#[derive(Serialize, Deserialize)]
pub struct ChunkData { pub id: String, pub boundingBox: BoundingBox, pub lineIndex: u32, pub positionOnLine: u32 }

#[derive(Serialize, Deserialize)]
pub enum Direction { Ltr, Rtl }

#[wasm_bindgen]
pub fn reflow(elements_js: JsValue, page_width_mm: f64, paragraph_spacing_mm: f64, margin_left_mm: f64) -> JsValue {
    let elements: Vec<ReflowElement> = serde_wasm_bindgen::from_value(elements_js).unwrap_or_default();
    let positioned = reflow_internal(elements, page_width_mm, paragraph_spacing_mm, margin_left_mm);
    serde_wasm_bindgen::to_value(&positioned).unwrap()
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ReflowElement {
    id: String,
    kind: String,
    x: f64, y: f64,
    width: f64, height: f64,
}

fn reflow_internal(mut elements: Vec<ReflowElement>, page_width: f64, paragraph_spacing: f64, margin_left: f64) -> Vec<ReflowElement> {
    let margin_right = 15.0;
    let mut cursor_x = margin_left;
    let mut cursor_y = 0.0;
    let mut line_height: f64 = 0.0;
    for el in &mut elements {
        if el.kind == "paragraph-break" {
            el.x = cursor_x; el.y = cursor_y;
            cursor_x = margin_left;
            cursor_y += paragraph_spacing + if line_height > 0.0 { line_height } else { 4.0 };
            line_height = 0.0;
            continue;
        }
        if el.kind == "line-break" {
            el.x = cursor_x; el.y = cursor_y;
            cursor_x = margin_left;
            cursor_y += if line_height > 0.0 { line_height } else { 4.0 };
            line_height = 0.0;
            continue;
        }
        let w = if el.width > 0.0 { el.width } else { 5.0 };
        let h = if el.height > 0.0 { el.height } else { 4.0 };
        if cursor_x + w > page_width - margin_right + 0.01 && cursor_x > margin_left {
            cursor_x = margin_left;
            cursor_y += line_height;
            line_height = 0.0;
        }
        el.x = cursor_x;
        el.y = cursor_y;
        cursor_x += w;
        line_height = line_height.max(h);
    }
    elements
}

#[wasm_bindgen]
pub fn segment_image_stub(_bytes: &[u8]) -> JsValue {
    let chunks: Vec<ChunkData> = vec![];
    serde_wasm_bindgen::to_value(&chunks).unwrap()
}
