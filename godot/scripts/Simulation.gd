extends RefCounted

const Iso = preload("res://scripts/Iso.gd")
const VisitorSim = preload("res://scripts/VisitorSim.gd")

const SAVE_VERSION := 1

var money
var rng := RandomNumberGenerator.new()

var day := 1
var counter := 4320
var accumulator := 0.0
var speed_level := 1
var paused := false

var visitors: Array = []
var booths: Array = []
var _occupied: Dictionary = {}
var _next_id := 1
var _spawn_cooldown := 0
var _used_timer_cache: Dictionary = {}
var _booth_data_cache: Dictionary = {}

var save_callback: Callable

func _init(p_money) -> void:
	money = p_money
	rng.randomize()

func speed_effect() -> int:
	match speed_level:
		2: return 3
		3: return 5
		_: return 1

func process(delta: float) -> void:
	if paused:
		return
	accumulator += delta * float(speed_effect())
	while accumulator >= 1.0 / 23.0:
		_tick_once()
		accumulator -= 1.0 / 23.0

func _tick_once() -> void:
	counter += 1
	_spawn_cooldown -= 1

	for v in visitors:
		v.tick(self)

	var alive: Array = []
	for v in visitors:
		if not v.finished:
			alive.append(v)
	visitors = alive

	if visitors.is_empty() and _spawn_cooldown <= 0 and booths.size() > 0:
		spawn_visitor()
		_spawn_cooldown = 180

	if counter % 23 == 0:
		for v in visitors:
			v.ai_tick(self)

	var h := hitung_hari()
	if day < h:
		day = h
		if save_callback.is_valid():
			save_callback.call()

func hitung_hari() -> int:
	return int(floor(float(counter) / 12960.0)) + 1

func hour_day() -> int:
	var hour := float(counter) / 540.0
	return int(floor(hour)) % 24

func minute_day() -> int:
	var minute := float(counter) / 9.0
	return int(floor(minute)) % 60

func spawn_visitor() -> void:
	var spawn_tile := Vector2i(8, 34)
	var v = VisitorSim.new(_next_id, spawn_tile)
	_next_id += 1
	v.setup_target(self)
	var cash := rng.randi_range(225, 1250)
	money.open_wallet(v.id, cash)
	visitors.append(v)

func register_booth(cells: Array, booth_type: String) -> void:
	var copy: Array = []
	for c in cells:
		copy.append(c)
		_occupied[c] = true
	booths.append({"type": booth_type, "cells": copy, "level": 1})
	_spawn_cooldown = 0

func find_path(start: Vector2i, goal: Vector2i) -> Array:
	if start == goal:
		return []
	if not is_walkable(start) or not is_walkable(goal):
		return []
	var visited: Dictionary = {start: true}
	var parent: Dictionary = {start: null}
	var queue: Array = [start]
	while not queue.is_empty():
		var cur: Vector2i = queue.pop_front()
		if cur == goal:
			break
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = cur + d
			if is_walkable(n) and not visited.has(n):
				visited[n] = true
				parent[n] = cur
				queue.append(n)
	if not parent.has(goal):
		return []
	var path: Array = []
	var cur2 = goal
	while cur2 != null:
		path.push_front(cur2)
		cur2 = parent[cur2]
	if path.size() > 0 and path[0] == start:
		path.pop_front()
	return path

func is_walkable(tile: Vector2i) -> bool:
	if not Iso.is_in_bounds(tile, 37):
		return false
	if _occupied.has(tile):
		return false
	if tile.x >= 7 and tile.x <= 9 and tile.y >= 1 and tile.y <= 36:
		return true
	if tile.x == 6 and tile.y >= 19 and tile.y <= 22:
		return true
	if tile.x >= 10 and tile.x <= 15 and tile.y >= 20 and tile.y <= 21:
		return true
	return false

func booth_cost(booth_type: String, level: int = 1) -> int:
	var data := _booth_data(booth_type)
	var bp = data.get("booked_price", 0)
	if typeof(bp) == TYPE_ARRAY:
		var idx := clampi(level - 1, 0, bp.size() - 1)
		return int(bp[idx])
	return int(bp)

func booth_use_time(booth_type: String, visitor_index: int = 0) -> int:
	var times := _load_used_timer(booth_type)
	if times.is_empty():
		return 10
	var idx := clampi(visitor_index, 0, times.size() - 1)
	return int(times[idx])

func _booth_data(booth_type: String) -> Dictionary:
	if _booth_data_cache.has(booth_type):
		return _booth_data_cache[booth_type]
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/booths.json"))
	var booths = {}
	if typeof(parsed) == TYPE_DICTIONARY:
		booths = parsed.get("booths", {})
	var data = booths.get(booth_type, {})
	_booth_data_cache[booth_type] = data
	return data

func _load_used_timer(booth_type: String) -> Array:
	if _used_timer_cache.has(booth_type):
		return _used_timer_cache[booth_type]
	var result: Array = []
	var path := "res://exports/scripts/pack/serbi.as"
	if not FileAccess.file_exists(path):
		_used_timer_cache[booth_type] = result
		return result
	var text := FileAccess.get_file_as_string(path)
	var re := RegEx.new()
	re.compile("dataOb\\.usedTimer\\[\"" + booth_type + "\"\\] = \\[(.*?)\\];")
	var m := re.search(text)
	if m:
		for part in m.get_string(1).split(","):
			var s := part.strip_edges()
			if s != "":
				result.append(int(s))
	_used_timer_cache[booth_type] = result
	return result

func to_save_dict() -> Dictionary:
	var booth_list: Array = []
	for b in booths:
		var cells: Array = []
		for c in b.cells:
			cells.append({"x": c.x, "y": c.y})
		booth_list.append({"type": b.type, "cells": cells, "level": b.level})
	var visitor_list: Array = []
	for v in visitors:
		visitor_list.append(v.to_dict())
	var wallet_list: Dictionary = {}
	for k in money.wallets.keys():
		wallet_list[str(k)] = money.wallets[k]
	return {
		"version": SAVE_VERSION,
		"day": day,
		"counter": counter,
		"money": money.resort,
		"wallets": wallet_list,
		"speed_level": speed_level,
		"paused": paused,
		"next_id": _next_id,
		"spawn_cooldown": _spawn_cooldown,
		"booths": booth_list,
		"visitors": visitor_list,
	}

func from_save_dict(d: Dictionary) -> void:
	day = int(d.get("day", 1))
	counter = int(d.get("counter", 4320))
	money.resort = float(d.get("money", 10000))
	money.wallets.clear()
	var wallets = d.get("wallets", {})
	for k in wallets.keys():
		money.wallets[int(k)] = int(wallets[k])
	speed_level = int(d.get("speed_level", 1))
	paused = bool(d.get("paused", false))
	_next_id = int(d.get("next_id", 1))
	_spawn_cooldown = int(d.get("spawn_cooldown", 0))

	booths.clear()
	_occupied.clear()
	for b in d.get("booths", []):
		var cells: Array = []
		for c in b.get("cells", []):
			var cell := Vector2i(int(c.x), int(c.y))
			cells.append(cell)
			_occupied[cell] = true
		booths.append({"type": b.get("type", ""), "cells": cells, "level": int(b.get("level", 1))})

	visitors.clear()
	for v in d.get("visitors", []):
		var vs = VisitorSim.from_dict(v)
		visitors.append(vs)
