extends RefCounted

## Runtime reader for the atlas manifest written by tools/build_atlas.py.
##
## The manifest stores, for every symbol frame, the page it lives on and how
## the trimmed pixels map back onto the untrimmed symbol:
##
##   pivot   pixel in the untrimmed frame that is the symbol origin
##   offset  untrimmed frame top-left relative to that origin
##   crop    trimmed rect inside the untrimmed frame
##   region  rect inside the atlas page
##
## Placing a region at `offset + crop.xy` (see art_rect) reproduces the
## original composition, so callers only have to decide where the symbol
## origin goes: a tile centre, the centre of a booth footprint, and so on.

const MANIFEST_PATH := "res://assets/atlas/manifest.json"
const ATLAS_DIR := "res://assets/atlas/"

## Frame id ("TileClip::10", "Lobby.body::1") -> manifest record.
var frames: Dictionary = {}
## Atlas file name -> ImageTexture of the whole page.
var pages: Dictionary = {}
## Clip name ("Visitor1.walk_front") -> {frames, fps, loop}.
var clips: Dictionary = {}

var error := ""

var _images: Dictionary = {}
var _textures: Dictionary = {}


func _init(manifest_path: String = MANIFEST_PATH) -> void:
	if not FileAccess.file_exists(manifest_path):
		error = "Atlas manifest missing: " + manifest_path
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if typeof(parsed) != TYPE_DICTIONARY:
		error = "Atlas manifest is not a JSON object: " + manifest_path
		return

	for record in parsed.get("frames", []):
		if typeof(record) == TYPE_DICTIONARY and record.has("id"):
			frames[record["id"]] = record
	clips = parsed.get("clips", {})

	for page in parsed.get("pages", []):
		_load_page(str(page.get("file", "")))

	if frames.is_empty() and error == "":
		error = "Atlas manifest has no frames: " + manifest_path


func has_frame(id: String) -> bool:
	return frames.has(id)


func frame(id: String) -> Dictionary:
	return frames.get(id, {})


## Rect of the trimmed art relative to the symbol origin, in pixels.
## Drawing this rect at the origin reproduces the original composition.
func art_rect(id: String) -> Rect2:
	var f := frame(id)
	if f.is_empty():
		return Rect2()
	var crop = f.get("crop", [0, 0, 0, 0])
	var offset = f.get("offset", [0, 0])
	var region = f.get("region", [0, 0, 0, 0])
	return Rect2(
		float(offset[0] + crop[0]),
		float(offset[1] + crop[1]),
		float(region[2]),
		float(region[3])
	)


## Centre of the trimmed art relative to the symbol origin. Used to sit a
## booth on the centre of its footprint.
func art_centre(id: String) -> Vector2:
	var art := art_rect(id)
	return art.position + art.size * 0.5


func region_rect(id: String) -> Rect2:
	var f := frame(id)
	var region = f.get("region", [0, 0, 0, 0])
	return Rect2(region[0], region[1], region[2], region[3])


## AtlasTexture for one frame, cached so repeated draws share the texture.
func texture(id: String) -> AtlasTexture:
	if _textures.has(id):
		return _textures[id]
	var f := frame(id)
	if f.is_empty():
		return null
	var page = pages.get(f.get("atlas", ""))
	if page == null:
		return null
	var texture := AtlasTexture.new()
	texture.atlas = page
	texture.region = region_rect(id)
	texture.filter_clip = true
	_textures[id] = texture
	return texture


func page_texture(file: String) -> Texture2D:
	return pages.get(file, null)


func page_image(file: String) -> Image:
	return _images.get(file, null)


func _load_page(file: String) -> void:
	if file == "" or pages.has(file):
		return
	var bytes := FileAccess.get_file_as_bytes(ATLAS_DIR + file)
	if bytes.is_empty():
		error = "Atlas page missing: " + ATLAS_DIR + file
		return
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		error = "Atlas page is not a readable PNG: " + ATLAS_DIR + file
		return
	_images[file] = image
	pages[file] = ImageTexture.create_from_image(image)
