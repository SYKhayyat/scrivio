use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct BoundingBox { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

#[derive(Serialize, Deserialize, Clone)]
pub struct ChunkData { pub id: String, pub boundingBox: BoundingBox, pub lineIndex: u32, pub positionOnLine: u32 }

#[derive(Serialize, Deserialize, Clone, Copy)]
pub enum Direction { Ltr, Rtl }

#[derive(Serialize, Deserialize, Clone)]
pub struct ImportRegion { pub x: f64, pub y: f64, pub w: f64, pub h: f64, pub columns: u32, pub dividers: Vec<f64> }

#[wasm_bindgen]
pub fn reflow(elements_js: JsValue, page_width_mm: f64, paragraph_spacing_mm: f64, margin_left_mm: f64, margin_right_mm: f64) -> Result<JsValue, JsValue> {
    let elements: Vec<ReflowElement> = serde_wasm_bindgen::from_value(elements_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let positioned = reflow_internal(elements, page_width_mm, paragraph_spacing_mm, margin_left_mm, margin_right_mm);
    serde_wasm_bindgen::to_value(&positioned).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ReflowElement { id: String, kind: String, x: f64, y: f64, width: f64, height: f64 }

fn reflow_internal(mut elements: Vec<ReflowElement>, page_width: f64, paragraph_spacing: f64, margin_left: f64, margin_right: f64) -> Vec<ReflowElement> {
    let mut cursor_x = margin_left;
    let mut cursor_y = 0.0;
    let mut line_height: f64 = 0.0;
    for el in &mut elements {
        if el.kind == "paragraph-break" {
            el.x = cursor_x; el.y = cursor_y;
            cursor_x = margin_left;
            cursor_y += paragraph_spacing + if line_height > 0.0 { line_height } else { 4.0 };
            line_height = 0.0; continue;
        }
        if el.kind == "line-break" {
            el.x = cursor_x; el.y = cursor_y;
            cursor_x = margin_left;
            cursor_y += if line_height > 0.0 { line_height } else { 4.0 };
            line_height = 0.0; continue;
        }
        let w = if el.width > 0.0 { el.width } else { 5.0 };
        let h = if el.height > 0.0 { el.height } else { 4.0 };
        if cursor_x + w > page_width - margin_right + 0.01 && cursor_x > margin_left {
            cursor_x = margin_left; cursor_y += line_height; line_height = 0.0;
        }
        el.x = cursor_x; el.y = cursor_y; cursor_x += w; line_height = line_height.max(h);
    }
    elements
}

/// Zero-copy reflow: the hot path used on every keystroke.
///
/// Elements are passed as parallel flat arrays (kind codes + sizes) and
/// positions are returned as a flat `[x0, y0, x1, y1, …]` array in input
/// order — no serde, no per-element allocation across the boundary.
/// Kind codes: 0 = generic element, 1 = line-break, 2 = paragraph-break.
#[wasm_bindgen]
pub fn reflow_flat(
    kinds: &[u8],
    widths: &[f64],
    heights: &[f64],
    page_width_mm: f64,
    paragraph_spacing_mm: f64,
    margin_left_mm: f64,
    margin_right_mm: f64,
) -> Vec<f64> {
    let n = kinds.len();
    let mut out = Vec::with_capacity(n * 2);
    let mut cursor_x = margin_left_mm;
    let mut cursor_y = 0.0;
    let mut line_height: f64 = 0.0;
    for i in 0..n {
        match kinds[i] {
            2 => {
                out.push(cursor_x); out.push(cursor_y);
                cursor_x = margin_left_mm;
                cursor_y += paragraph_spacing_mm + if line_height > 0.0 { line_height } else { 4.0 };
                line_height = 0.0;
            }
            1 => {
                out.push(cursor_x); out.push(cursor_y);
                cursor_x = margin_left_mm;
                cursor_y += if line_height > 0.0 { line_height } else { 4.0 };
                line_height = 0.0;
            }
            _ => {
                let w = if widths[i] > 0.0 { widths[i] } else { 5.0 };
                let h = if heights[i] > 0.0 { heights[i] } else { 4.0 };
                if cursor_x + w > page_width_mm - margin_right_mm + 0.01 && cursor_x > margin_left_mm {
                    cursor_x = margin_left_mm;
                    cursor_y += line_height;
                    line_height = 0.0;
                }
                out.push(cursor_x); out.push(cursor_y);
                cursor_x += w;
                line_height = line_height.max(h);
            }
        }
    }
    out
}

/// Page-break positions, in mm. Given the laid-out element y-coordinates and
/// the usable body height, returns the y at which each new page begins.
/// Takes the same input as the TS `computePageBreaks` engine method so the
/// browser runs the Rust path (the TS twin exists only for jsdom tests).
#[wasm_bindgen]
pub fn reflow_page_breaks(ys: &[f64], body_height_mm: f64) -> Vec<f64> {
    let mut breaks = Vec::new();
    let mut page_end = body_height_mm;
    for &y in ys {
        if y >= page_end {
            breaks.push(y);
            page_end += body_height_mm;
        }
    }
    breaks
}

/// Small viewport-culling helper: which elements intersect the band
/// `[top_mm, bottom_mm]`. Mirrors the TS `getVisibleIndices` so rendering in
/// the browser runs the same Rust path as everything else.
///
/// Returns the indices (as u32) of elements whose box `y..y+h` overlaps the
/// band. Callers convert the pixel viewport to mm first (dpi/zoom), matching
/// the TS twin.
#[wasm_bindgen]
pub fn reflow_visible_indices(ys: &[f64], heights: &[f64], top_mm: f64, bottom_mm: f64) -> Vec<u32> {
    let n = ys.len();
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        if ys[i] + heights[i] >= top_mm && ys[i] <= bottom_mm {
            out.push(i as u32);
        }
    }
    out
}

/// One serializable element for the Ksav/Typst export.
///
/// Only carries the fields the serializer needs; `has_bytes` tells us whether
/// a chunk's cropped image is available so we know whether to emit its
/// `#image(...)` line (mirroring the TS twin, which skipped chunks without
/// bytes).
#[derive(Serialize, Deserialize, Clone)]
struct KsavElement {
    #[serde(rename = "kind")]
    kind: String,
    #[serde(rename = "text", skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(rename = "number", skip_serializing_if = "Option::is_none")]
    number: Option<u32>,
    #[serde(rename = "id", skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(rename = "width", skip_serializing_if = "Option::is_none")]
    width: Option<f64>,
    #[serde(rename = "hasBytes", default)]
    has_bytes: bool,
}

/// Build the Ksav/Typst document body (the direction/language header plus the
/// element flow), in Rust. Mirrors the TS `buildBody`, so the browser does the
/// serialization in the engine rather than in TypeScript string-building.
#[wasm_bindgen]
pub fn ksav_body_typst(elements_js: JsValue, rtl: bool) -> Result<String, JsValue> {
    let elements: Vec<KsavElement> = serde_wasm_bindgen::from_value(elements_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mut out = String::new();
    out.push_str(&format!(
        "#set text(lang: {}, dir: {}, size: 11pt)\\n",
        if rtl { "\"he\"" } else { "\"en\"" },
        if rtl { "rtl" } else { "ltr" }
    ));
    for el in elements {
        match el.kind.as_str() {
            "typed-word" => {
                out.push_str(&escape_typst(el.text.as_deref().unwrap_or("")));
                out.push(' ');
            }
            "line-break" => out.push_str("\\\\\n"),
            "paragraph-break" => out.push_str("\n\n"),
            "bullet" => out.push_str("• "),
            "footnote-ref" => {
                out.push('[');
                out.push_str(&el.number.unwrap_or(0).to_string());
                out.push_str("]");
            }
            "chunk" => {
                if el.has_bytes {
                    let id = el.id.as_deref().unwrap_or("");
                    out.push_str(&format!("#image(\"chunk-{id}.jpg\", width: {}mm) ", fmt_mm(el.width.unwrap_or(0.0))));
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

/// Format an mm width to 1 decimal, matching the TS twin (`fmt`).
fn fmt_mm(n: f64) -> String {
    let v = (n * 10.0).round() / 10.0;
    format!("{:.1}", v)
}

/// Escape Typst markup special characters for inline text, matching the TS
/// twin (`escapeTypstText`): `#$\\*_`-` get a backslash prefix.
fn escape_typst(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '#' | '$' | '\\' | '*' | '_' | '`' | '-') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

#[wasm_bindgen]
pub fn segment_image(image_bytes: &[u8], direction_js: JsValue, columns: Option<u32>, regions_js: JsValue) -> Result<JsValue, JsValue> {
    let direction: Direction = serde_wasm_bindgen::from_value(direction_js).unwrap_or(Direction::Ltr);
    let regions: Vec<ImportRegion> = if regions_js.is_null() || regions_js.is_undefined() {
        vec![]
    } else {
        serde_wasm_bindgen::from_value(regions_js).unwrap_or_default()
    };
    let chunks = segment_image_internal(image_bytes, direction, columns, regions).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&chunks).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn crop_chunk(image_bytes: &[u8], x: f64, y: f64, w: f64, h: f64, quality: u8) -> Result<Vec<u8>, JsValue> {
    crop_internal(image_bytes, x as u32, y as u32, w as u32, h as u32, quality).map_err(|e| JsValue::from_str(&e))
}

fn segment_image_internal(bytes: &[u8], direction: Direction, columns: Option<u32>, regions: Vec<ImportRegion>) -> Result<Vec<ChunkData>, String> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let gray = img.to_luma8();
    let (scaled, scale_x, scale_y) = downscale(gray, 3000);
    let binary = binarize_adaptive(&scaled, 25, 7.0);
    let mut blobs = connected_components(&binary, scaled.width(), scaled.height());
    blobs.retain(|b| b.area >= 5 && (b.area as f32) < (scaled.width() * scaled.height()) as f32 * 0.5);
    if blobs.is_empty() { return Ok(vec![]); }
    let chunks = group_into_words(&blobs);
    // Regions arrive in original-image pixels; convert to scaled coordinates.
    let scaled_regions: Vec<ScaledRegion> = regions
        .iter()
        .map(|r| ScaledRegion {
            x: r.x / scale_x,
            y: r.y / scale_y,
            w: r.w / scale_x,
            h: r.h / scale_y,
            columns: r.columns.max(1).min(6),
            dividers: r.dividers.iter().map(|d| d / scale_x).collect(),
        })
        .collect();
    let ordered = order_chunks_with_regions(chunks, direction, &scaled_regions, columns);
    let merged = handle_punctuation(ordered, &blobs);
    let mut out = Vec::new();
    for (idx, c) in merged.into_iter().enumerate() {
        out.push(ChunkData {
            id: format!("chunk-{}-{}", c.line_index, idx),
            boundingBox: BoundingBox {
                x: (c.x as f64 * scale_x),
                y: (c.y as f64 * scale_y),
                w: (c.w as f64 * scale_x),
                h: (c.h as f64 * scale_y),
            },
            lineIndex: c.line_index,
            positionOnLine: idx as u32,
        });
    }
    Ok(out)
}

fn downscale(img: image::GrayImage, long_edge: u32) -> (image::GrayImage, f64, f64) {
    let (w, h) = (img.width(), img.height());
    let max_dim = w.max(h);
    if max_dim <= long_edge { return (img, 1.0, 1.0); }
    let scale = long_edge as f64 / max_dim as f64;
    let nw = (w as f64 * scale).round() as u32;
    let nh = (h as f64 * scale).round() as u32;
    let resized = image::imageops::resize(&img, nw, nh, image::imageops::FilterType::Triangle);
    (resized, w as f64 / nw as f64, h as f64 / nh as f64)
}

fn binarize_adaptive(img: &image::GrayImage, window: u32, c: f64) -> Vec<u8> {
    let (w, h) = (img.width(), img.height());
    let half = (window / 2) as i32;
    let mut integral = vec![0u64; (w * h) as usize];
    for y in 0..h {
        let mut row_sum: u64 = 0;
        for x in 0..w {
            row_sum += img.get_pixel(x, y)[0] as u64;
            let idx = (y * w + x) as usize;
            integral[idx] = row_sum + if y > 0 { integral[((y - 1) * w + x) as usize] } else { 0 };
        }
    }
    let mut bin = vec![0u8; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let x1 = (x as i32 - half).max(0) as u32;
            let y1 = (y as i32 - half).max(0) as u32;
            let x2 = (x as i32 + half).min(w as i32 - 1) as u32;
            let y2 = (y as i32 + half).min(h as i32 - 1) as u32;
            let area = ((x2 - x1 + 1) * (y2 - y1 + 1)) as u64;
            let sum = integral_sum(&integral, w, x1, y1, x2, y2);
            let mean = sum as f64 / area as f64;
            let v = img.get_pixel(x, y)[0] as f64;
            bin[(y * w + x) as usize] = if v < mean - c { 1 } else { 0 };
        }
    }
    bin
}

fn integral_sum(integral: &[u64], w: u32, x1: u32, y1: u32, x2: u32, y2: u32) -> u64 {
    let a = integral[(y2 * w + x2) as usize];
    let b = if x1 > 0 { integral[(y2 * w + x1 - 1) as usize] } else { 0 };
    let c = if y1 > 0 { integral[((y1 - 1) * w + x2) as usize] } else { 0 };
    let d = if x1 > 0 && y1 > 0 { integral[((y1 - 1) * w + x1 - 1) as usize] } else { 0 };
    a - b - c + d
}

#[derive(Clone, Copy, Debug)]
struct BlobRect { x: u32, y: u32, w: u32, h: u32, area: u32 }

fn connected_components(binary: &[u8], w: u32, h: u32) -> Vec<BlobRect> {
    let n = (w * h) as usize;
    let mut labels = vec![-1i32; n];
    let mut parent: Vec<i32> = (0..n as i32).collect();
    let find = |parent: &mut Vec<i32>, mut x: i32| -> i32 {
        while parent[x as usize] != x { x = parent[x as usize]; }
        x
    };
    let mut next_label: i32 = 0;
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if binary[idx] == 0 { continue; }
            let mut neighbors: Vec<i32> = Vec::new();
            if x > 0 && binary[idx - 1] == 1 { neighbors.push(labels[idx - 1]); }
            if y > 0 && binary[idx - w as usize] == 1 { neighbors.push(labels[idx - w as usize]); }
            if neighbors.is_empty() {
                labels[idx] = next_label; next_label += 1;
            } else {
                let min = neighbors.iter().filter(|&&v| v != -1).min().copied().unwrap_or(next_label);
                labels[idx] = min;
                for nb in neighbors { if nb != -1 && nb != min { let ra = find(&mut parent, min); let rb = find(&mut parent, nb); if ra != rb { parent[rb as usize] = ra; } } }
            }
        }
    }
    let mut remap = std::collections::HashMap::new();
    let mut compact: i32 = 0;
    for i in 0..n {
        if labels[i] == -1 { continue; }
        let mut root = labels[i];
        while parent[root as usize] != root { root = parent[root as usize]; }
        let entry = remap.entry(root).or_insert_with(|| { let v = compact; compact += 1; v });
        labels[i] = *entry;
    }
    if compact == 0 { return vec![]; }
    let mut min_x = vec![u32::MAX; compact as usize];
    let mut min_y = vec![u32::MAX; compact as usize];
    let mut max_x = vec![0u32; compact as usize];
    let mut max_y = vec![0u32; compact as usize];
    let mut areas = vec![0u32; compact as usize];
    for y in 0..h { for x in 0..w {
        let idx = (y * w + x) as usize;
        let l = labels[idx]; if l == -1 { continue; }
        let li = l as usize;
        areas[li] += 1;
        if x < min_x[li] { min_x[li] = x; }
        if y < min_y[li] { min_y[li] = y; }
        if x > max_x[li] { max_x[li] = x; }
        if y > max_y[li] { max_y[li] = y; }
    }}
    let mut out = Vec::new();
    for i in 0..compact as usize {
        if areas[i] == 0 { continue; }
        out.push(BlobRect { x: min_x[i], y: min_y[i], w: max_x[i] - min_x[i] + 1, h: max_y[i] - min_y[i] + 1, area: areas[i] });
    }
    out
}

#[derive(Clone)]
struct Chunk { x: u32, y: u32, w: u32, h: u32, area: u32, line_index: u32 }

fn group_into_words(blobs: &[BlobRect]) -> Vec<Chunk> {
    if blobs.is_empty() { return vec![]; }
    let mut ws: Vec<u32> = blobs.iter().map(|b| b.w).collect(); ws.sort_unstable();
    let median_w = ws[ws.len() / 2] as f64;
    let threshold = median_w * 1.5;
    let n = blobs.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut [usize], mut x: usize) -> usize { while parent[x] != x { x = parent[x]; } x }
    let mut sorted: Vec<(usize, &BlobRect)> = blobs.iter().enumerate().collect();
    sorted.sort_by(|a, b| a.1.y.cmp(&b.1.y).then(a.1.x.cmp(&b.1.x)));
    for i in 0..sorted.len() {
        for j in (i + 1)..sorted.len() {
            let a = sorted[i].1; let b = sorted[j].1;
            if (a.y as i32 - b.y as i32).abs() > (a.h.max(b.h) * 2) as i32 { if b.y > a.y + a.h * 2 { break; } continue; }
            let gap = b.x as i32 - (a.x + a.w) as i32;
            if gap >= 0 && (gap as f64) < threshold && (a.y as i32 - b.y as i32).abs() < (a.h.max(b.h) as f64 * 0.5) as i32 {
                let ai = sorted[i].0; let bj = sorted[j].0;
                let ra = find(&mut parent, ai);
                let rb = find(&mut parent, bj);
                if ra != rb { parent[rb] = ra; }
            }
        }
    }
    let mut groups: std::collections::HashMap<usize, Vec<BlobRect>> = std::collections::HashMap::new();
    for (idx, b) in blobs.iter().enumerate() {
        let mut root = idx; while parent[root] != root { root = parent[root]; }
        groups.entry(root).or_default().push(*b);
    }
    let mut chunks = Vec::new();
    for group in groups.values() {
        let x = group.iter().map(|b| b.x).min().unwrap();
        let y = group.iter().map(|b| b.y).min().unwrap();
        let x2 = group.iter().map(|b| b.x + b.w).max().unwrap();
        let y2 = group.iter().map(|b| b.y + b.h).max().unwrap();
        chunks.push(Chunk { x, y, w: x2 - x, h: y2 - y, area: group.iter().map(|b| b.area).sum(), line_index: 0 });
    }
    chunks
}

/// A user-drawn section of the image, in scaled (working) coordinates.
#[derive(Clone)]
struct ScaledRegion { x: f64, y: f64, w: f64, h: f64, columns: u32, dividers: Vec<f64> }

/// Orders chunks in reading order.
///
/// Region-aware, column-major: regions read in the order given, then columns
/// within a region (rightmost first for RTL, leftmost first for LTR), then
/// lines top-to-bottom, then left/right within a line. Without regions the
/// whole image is treated as a single region with `columns` equal splits —
/// so a 2-column page reads column 1 fully, then column 2.
fn order_chunks_with_regions(mut chunks: Vec<Chunk>, direction: Direction, regions: &[ScaledRegion], columns: Option<u32>) -> Vec<Chunk> {
    if chunks.is_empty() { return chunks; }
    let effective: Vec<ScaledRegion> = if regions.is_empty() {
        let cols = match columns { Some(c) if c > 1 => c.min(6), _ => 1 };
        let min_x = chunks.iter().map(|c| c.x).min().unwrap_or(0) as f64;
        let min_y = chunks.iter().map(|c| c.y).min().unwrap_or(0) as f64;
        let max_x = chunks.iter().map(|c| c.x + c.w).max().unwrap_or(0) as f64;
        let max_y = chunks.iter().map(|c| c.y + c.h).max().unwrap_or(0) as f64;
        let width = (max_x - min_x).max(1.0);
        let dividers: Vec<f64> = (1..cols).map(|i| min_x + (i as f64 / cols as f64) * width).collect();
        vec![ScaledRegion { x: min_x, y: min_y, w: width, h: (max_y - min_y).max(1.0), columns: cols, dividers }]
    } else {
        regions.to_vec()
    };

    // 0-based reading-order column index inside a region (RTL: rightmost = 0).
    fn column_index(c: &Chunk, region: &ScaledRegion, direction: Direction) -> u32 {
        let cols = region.columns.max(1);
        if cols <= 1 { return 0; }
        let cx = c.x as f64 + c.w as f64 / 2.0;
        let mut dividers = region.dividers.clone();
        if dividers.len() != (cols as usize - 1) {
            dividers = (1..cols).map(|i| region.x + (i as f64 / cols as f64) * region.w).collect();
        }
        let mut col_from_left = 0u32;
        for d in &dividers { if cx > *d { col_from_left += 1; } }
        col_from_left = col_from_left.min(cols - 1);
        match direction { Direction::Rtl => cols - 1 - col_from_left, _ => col_from_left }
    }

    // Assign each chunk to the first region containing its center (outside = last).
    let mut assigned: Vec<(usize, u32, Chunk)> = chunks
        .into_iter()
        .map(|c| {
            let cx = c.x as f64 + c.w as f64 / 2.0;
            let cy = c.y as f64 + c.h as f64 / 2.0;
            let mut region_idx = effective.len();
            let mut col = 0u32;
            for (i, r) in effective.iter().enumerate() {
                if cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h {
                    region_idx = i;
                    col = column_index(&c, r, direction);
                    break;
                }
            }
            (region_idx, col, c)
        })
        .collect();

    let mut hs: Vec<u32> = assigned.iter().map(|a| a.2.h).collect();
    hs.sort_unstable();
    let median_h = hs[hs.len() / 2] as f64;
    let line_tolerance = median_h * 0.5;

    assigned.sort_by(|a, b| {
        if a.0 != b.0 { return a.0.cmp(&b.0); }
        if a.1 != b.1 { return a.1.cmp(&b.1); }
        let ya = a.2.y as f64 + a.2.h as f64 / 2.0;
        let yb = b.2.y as f64 + b.2.h as f64 / 2.0;
        if (ya - yb).abs() > line_tolerance { return ya.partial_cmp(&yb).unwrap(); }
        match direction {
            Direction::Rtl => (b.2.x + b.2.w).cmp(&(a.2.x + a.2.w)),
            _ => a.2.x.cmp(&b.2.x),
        }
    });

    assigned.into_iter().map(|a| a.2).collect()
}

fn handle_punctuation(mut chunks: Vec<Chunk>, blobs: &[BlobRect]) -> Vec<Chunk> {
    if chunks.is_empty() { return chunks; }
    let mut hs: Vec<u32> = chunks.iter().map(|c| c.h).collect(); hs.sort_unstable();
    let median_h = hs[hs.len()/2] as f64;
    let small: Vec<&BlobRect> = blobs.iter().filter(|b| (b.h as f64) < median_h * 0.4 && b.area >= 3).collect();
    for s in small {
        let is_chunk = chunks.iter().any(|c| c.x == s.x && c.y == s.y && c.w == s.w);
        if is_chunk { continue; }
        let mut nearest: Option<usize> = None; let mut best = f64::MAX;
        for (idx, c) in chunks.iter().enumerate() {
            let dx = ((s.x as i32 - (c.x + c.w) as i32).abs().min((c.x as i32 - (s.x + s.w) as i32).abs())) as f64;
            let dy = ((s.y as f64 + s.h as f64 / 2.0) - (c.y as f64 + c.h as f64 / 2.0)).abs();
            let dist = (dx*dx + dy*dy).sqrt();
            let char_w = c.w as f64 / 4.0;
            if dx < char_w && dy < c.h as f64 * 0.5 && dist < best { best = dist; nearest = Some(idx); }
        }
        if let Some(idx) = nearest {
            let aspect = s.w as f64 / s.h as f64;
            let fill = s.area as f64 / (s.w as f64 * s.h as f64);
            let is_punct = (aspect > 0.3 && aspect < 3.0 && fill > 0.3) || (s.h < 10 && s.w < 10);
            if is_punct {
                let c = &mut chunks[idx];
                let x = c.x.min(s.x); let y = c.y.min(s.y);
                let x2 = (c.x + c.w).max(s.x + s.w); let y2 = (c.y + c.h).max(s.y + s.h);
                c.x = x; c.y = y; c.w = x2 - x; c.h = y2 - y;
            }
        }
    }
    chunks
}

fn crop_internal(bytes: &[u8], x: u32, y: u32, w: u32, h: u32, quality: u8) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let rgb = img.to_rgb8();
    let (iw, ih) = (rgb.width(), rgb.height());
    let x = x.min(iw.saturating_sub(1)); let y = y.min(ih.saturating_sub(1));
    let w = w.min(iw - x); let h = h.min(ih - y);
    let cropped = image::imageops::crop_imm(&rgb, x, y, w, h).to_image();
    let mut buf = Vec::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    enc.encode_image(&cropped).map_err(|e| e.to_string())?;
    let _ = rgb;
    Ok(buf)
}
