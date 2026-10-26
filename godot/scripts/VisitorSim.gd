class_name VisitorSim
extends RefCounted

const Iso = preload("res://scripts/Iso.gd")

var id: int
var state := "to_facility"
var pos: Vector2
var tile: Vector2i
var spawn_tile: Vector2i
var facing_back := true
var facing_right := true
var path: Array = []
var path_index := 0
var target_tile: Vector2i
var target_booth_index := -1
var speed := 1.15
var use_timer := 0
var finished := false
var last_tile_delta := Vector2i(0, 1)

func _init(p_id: int, p_spawn: Vector2i) -> void:
	id = p_id
	spawn_tile = p_spawn
	tile = p_spawn
	pos = Iso.tile_to_world(p_spawn)

func setup_target(sim) -> void:
	var liked := ["Arcade", "IndiaResto", "Jacuzi", "Giftshop"]
	var candidates: Array = []
	for i in range(sim.booths.size()):
		var b = sim.booths[i]
		if b.type in liked:
			candidates.append(i)
	if candidates.is_empty():
		for i in range(sim.booths.size()):
			candidates.append(i)
	if candidates.is_empty():
		# no placed booth: wander to a nearby walkable tile
		target_tile = spawn_tile
		path = []
		state = "leaving"
		return
	# choose nearest candidate by path length
	var best_idx: int = int(candidates[0])
	var best_len: int = 999999
	for idx in candidates:
		var b = sim.booths[idx]
		var t = _adjacent_walkable(b.cells, sim)
		var p = sim.find_path(tile, t)
		if p.size() < best_len:
			best_len = p.size()
			best_idx = idx
			target_tile = t
	target_booth_index = best_idx
	path = sim.find_path(tile, target_tile)
	path_index = 0
	if path.is_empty() and tile != target_tile:
		state = "leaving"
		target_tile = spawn_tile
		path = sim.find_path(tile, target_tile)
		path_index = 0

func _adjacent_walkable(cells: Array, sim) -> Vector2i:
	var neighbors: Array = []
	for cell in cells:
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var n: Vector2i = cell + d
			if sim.is_walkable(n):
				neighbors.append(n)
	if neighbors.is_empty():
		return cells[0] if not cells.is_empty() else tile
	# choose nearest to current tile
	var best = neighbors[0]
	var best_d = 999999
	for n in neighbors:
		var dd = abs(n.x - tile.x) + abs(n.y - tile.y)
		if dd < best_d:
			best_d = dd
			best = n
	return best

func tick(sim) -> void:
	if finished:
		return
	match state:
		"to_facility":
			_move_along_path()
			if path_index >= path.size() and tile == target_tile:
				var booth = sim.booths[target_booth_index] if target_booth_index >= 0 and target_booth_index < sim.booths.size() else null
				var cost := 0
				var use_time := 10
				if booth != null:
					cost = sim.booth_cost(booth.type, booth.level)
					use_time = sim.booth_use_time(booth.type, 0)
				if booth != null and sim.money.can_afford(id, cost):
					sim.money.pay(id, cost, 0.0)
					use_timer = use_time * 23
					state = "using"
				else:
					state = "leaving"
					target_tile = spawn_tile
					path = sim.find_path(tile, target_tile)
					path_index = 0
		"using":
			use_timer -= 1
			if use_timer <= 0:
				state = "leaving"
				target_tile = spawn_tile
				path = sim.find_path(tile, target_tile)
				path_index = 0
		"leaving":
			_move_along_path()
			if path_index >= path.size() and tile == target_tile:
				finished = true

func _move_along_path() -> void:
	if path_index >= path.size():
		return
	var next_tile: Vector2i = path[path_index]
	var next_pos: Vector2 = Iso.tile_to_world(next_tile)
	var delta: Vector2 = next_pos - pos
	var step_dist := speed
	if delta.length() <= step_dist or delta.length() <= 0.001:
		var before := tile
		pos = next_pos
		tile = next_tile
		last_tile_delta = next_tile - before
		_update_facing(last_tile_delta)
		path_index += 1
	else:
		var step := delta.normalized() * step_dist
		pos += step
		last_tile_delta = next_tile - tile
		_update_facing(last_tile_delta)

func _update_facing(d: Vector2i) -> void:
	if d.x == 0 and d.y != 0:
		facing_back = d.y > 0
		facing_right = d.y > 0
	elif d.y == 0 and d.x != 0:
		facing_back = d.x > 0
		facing_right = d.x < 0

func ai_tick(_sim) -> void:
	pass

func to_dict() -> Dictionary:
	var path_list: Array = []
	for p in path:
		path_list.append({"x": p.x, "y": p.y})
	return {
		"id": id,
		"state": state,
		"pos": {"x": pos.x, "y": pos.y},
		"tile": {"x": tile.x, "y": tile.y},
		"spawn_tile": {"x": spawn_tile.x, "y": spawn_tile.y},
		"facing_back": facing_back,
		"facing_right": facing_right,
		"path": path_list,
		"path_index": path_index,
		"target_tile": {"x": target_tile.x, "y": target_tile.y},
		"target_booth_index": target_booth_index,
		"speed": speed,
		"use_timer": use_timer,
		"finished": finished,
		"last_tile_delta": {"x": last_tile_delta.x, "y": last_tile_delta.y},
	}

static func from_dict(d: Dictionary) -> VisitorSim:
	var v = (load("res://scripts/VisitorSim.gd") as GDScript).new(int(d.get("id", 0)), Vector2i(int(d.get("spawn_tile", {}).get("x", 8)), int(d.get("spawn_tile", {}).get("y", 34))))
	v.state = str(d.get("state", "to_facility"))
	var posd = d.get("pos", {})
	v.pos = Vector2(float(posd.get("x", 0)), float(posd.get("y", 0)))
	var tild = d.get("tile", {})
	v.tile = Vector2i(int(tild.get("x", 0)), int(tild.get("y", 0)))
	v.facing_back = bool(d.get("facing_back", true))
	v.facing_right = bool(d.get("facing_right", true))
	v.path = []
	for p in d.get("path", []):
		v.path.append(Vector2i(int(p.x), int(p.y)))
	v.path_index = int(d.get("path_index", 0))
	var ttd = d.get("target_tile", {})
	v.target_tile = Vector2i(int(ttd.get("x", 0)), int(ttd.get("y", 0)))
	v.target_booth_index = int(d.get("target_booth_index", -1))
	v.speed = float(d.get("speed", 1.15))
	v.use_timer = int(d.get("use_timer", 0))
	v.finished = bool(d.get("finished", false))
	var ltd = d.get("last_tile_delta", {})
	v.last_tile_delta = Vector2i(int(ltd.get("x", 0)), int(ltd.get("y", 1)))
	return v
