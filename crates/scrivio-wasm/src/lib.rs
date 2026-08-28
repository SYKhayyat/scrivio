use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct BoundingBox { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

#[derive(Serialize, Deserialize, Clone)]
pub struct ChunkData { pub id: String, pub boundingBox: BoundingBox, pub lineIndex: u32, pub positionOnLine: u32 }

#[derive(Serialize, Deserialize, Clone, Copy)]
pub enum Direction { Ltr, Rtl }

#[derive(Serialize, Deserialize, Clone)]
pub struct SegmentOptions { pub direction: Direction, pub columns: Option<u32> }

#[wasm_bindgen]
pub fn reflow(elements_js: JsValue, page_width_mm: f64, paragraph_spacing_mm: f64, margin_left_mm: f64) -> Result<JsValue, JsValue> {
    let elements: Vec<ReflowElement> = serde_wasm_bindgen::from_value(elements_js).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let positioned = reflow_internal(elements, page_width_mm, paragraph_spacing_mm, margin_left_mm);
    serde_wasm_bindgen::to_value(&positioned).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ReflowElement { id: String, kind: String, x: f64, y: f64, width: f64, height: f64 }

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

#[wasm_bindgen]
pub fn segment_image(image_bytes: &[u8], direction_js: JsValue, columns: Option<u32>) -> Result<JsValue, JsValue> {
    let direction: Direction = serde_wasm_bindgen::from_value(direction_js).unwrap_or(Direction::Ltr);
    let chunks = segment_image_internal(image_bytes, direction, columns).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&chunks).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn crop_chunk(image_bytes: &[u8], x: f64, y: f64, w: f64, h: f64, quality: u8) -> Result<Vec<u8>, JsValue> {
    crop_internal(image_bytes, x as u32, y as u32, w as u32, h as u32, quality).map_err(|e| JsValue::from_str(&e))
}

fn segment_image_internal(bytes: &[u8], direction: Direction, columns: Option<u32>) -> Result<Vec<ChunkData>, String> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let gray = img.to_luma8();
    let (orig_w, orig_h) = (gray.width(), gray.height());
    let (scaled, scale_x, scale_y) = downscale(gray, 3000);
    let binary = binarize_adaptive(&scaled, 25, 7.0);
    let mut blobs = connected_components(&binary, scaled.width(), scaled.height());
    blobs.retain(|b| b.area >= 5 && (b.area as f32) < (scaled.width() * scaled.height()) as f32 * 0.5);
    if blobs.is_empty() { return Ok(vec![]); }
    let chunks = group_into_words(&blobs);
    let lines = detect_lines(&chunks);
    let ordered = order_chunks(lines, direction, columns);
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
    let _ = (orig_w, orig_h);
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
    let find = |parent: &mut Vec<usize>, mut x: usize| -> usize { while parent[x] != x { x = parent[x]; } x };
    let mut sorted: Vec<(usize, &BlobRect)> = blobs.iter().enumerate().collect();
    sorted.sort_by(|a, b| a.1.y.cmp(&b.1.y).then(a.1.x.cmp(&b.1.x)));
    for i in 0..sorted.len() {
        for j in (i + 1)..sorted.len() {
            let a = sorted[i].1; let b = sorted[j].1;
            if (a.y as i32 - b.y as i32).abs() > (a.h.max(b.h) * 2) as i32 { if b.y > a.y + a.h * 2 { break; } continue; }
            let gap = b.x as i32 - (a.x + a.w) as i32;
            if gap >= 0 && (gap as f64) < threshold && (a.y as i32 - b.y as i32).abs() < (a.h.max(b.h) as f64 * 0.5) as i32 {
                let ai = sorted[i].0; let bj = sorted[j].0;
                let ra = find(&mut parent.clone(), ai); let rb = find(&mut parent.clone(), bj);
                let _ = (ra, rb);
                let mut p = parent.clone();
                let ra2 = { let mut x = ai; while p[x] != x { x = p[x]; } x };
                let rb2 = { let mut x = bj; while p[x] != x { x = p[x]; } x };
                if ra2 != rb2 { parent[rb2] = ra2; }
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

fn detect_lines(mut chunks: Vec<Chunk>) -> Vec<Chunk> {
    if chunks.is_empty() { return chunks; }
    let mut hs: Vec<u32> = chunks.iter().map(|c| c.h).collect(); hs.sort_unstable();
    let median_h = hs[hs.len() / 2] as f64;
    chunks.sort_by(|a, b| (a.y as f64 + a.h as f64 / 2.0).partial_cmp(&(b.y as f64 + b.h as f64 / 2.0)).unwrap());
    let mut current_line: u32 = 0;
    let mut current_center = chunks[0].y as f64 + chunks[0].h as f64 / 2.0;
    let mut out = Vec::new();
    for mut c in chunks {
        let center = c.y as f64 + c.h as f64 / 2.0;
        if (center - current_center).abs() > median_h * 0.5 {
            current_line += 1; current_center = center;
        }
        c.line_index = current_line; out.push(c);
    }
    out
}

fn order_chunks(mut chunks: Vec<Chunk>, direction: Direction, columns: Option<u32>) -> Vec<Chunk> {
    use std::collections::HashMap;
    let mut by_line: HashMap<u32, Vec<Chunk>> = HashMap::new();
    for c in chunks.drain(..) { by_line.entry(c.line_index).or_default().push(c); }
    let mut line_indices: Vec<u32> = by_line.keys().copied().collect(); line_indices.sort_unstable();
    let mut result = Vec::new();
    if let Some(cols) = columns { if cols > 1 {
        let min_x = by_line.values().flat_map(|v| v.iter().map(|c| c.x)).min().unwrap_or(0);
        let max_x = by_line.values().flat_map(|v| v.iter().map(|c| c.x + c.w)).max().unwrap_or(0);
        let col_w = (max_x - min_x) as f64 / cols as f64;
        for li in line_indices {
            let mut line_chunks = by_line.remove(&li).unwrap();
            let mut by_col: HashMap<u32, Vec<Chunk>> = HashMap::new();
            for c in line_chunks.drain(..) {
                let col = (((c.x - min_x) as f64 / col_w).floor() as u32).min(cols - 1);
                by_col.entry(col).or_default().push(c);
            }
            let mut cols_sorted: Vec<u32> = by_col.keys().copied().collect(); cols_sorted.sort_unstable();
            for col in cols_sorted {
                let mut v = by_col.remove(&col).unwrap();
                v.sort_by(|a, b| match direction { Direction::Rtl => b.x.cmp(&a.x), _ => a.x.cmp(&b.x) });
                result.extend(v);
            }
        }
        return result;
    }}
    for li in line_indices {
        let mut v = by_line.remove(&li).unwrap();
        v.sort_by(|a, b| match direction { Direction::Rtl => b.x.cmp(&a.x), _ => a.x.cmp(&b.x) });
        result.extend(v);
    }
    result
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
    let mut rgb = img.to_rgb8();
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
