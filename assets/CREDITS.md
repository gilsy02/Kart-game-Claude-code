# Environment assets

All files under `assets/` come from [Poly Haven](https://polyhaven.com) and are licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain, no attribution required).
Downloaded 2026-09-27 at 1k resolution via the Poly Haven API.

## HDRI skies (`assets/hdri/`)

| Theme | File | Poly Haven asset |
|-------|------|------------------|
| 마녀 도시 (Witch City) | `moonlit_golf_1k.hdr` | https://polyhaven.com/a/moonlit_golf |
| 뉴욕 도심 (NYC) | `modern_buildings_night_1k.hdr` | https://polyhaven.com/a/modern_buildings_night |
| 조선시대 (Joseon) | `kiara_8_sunset_1k.hdr` | https://polyhaven.com/a/kiara_8_sunset |
| 빌리지 (Village, 낮) | `kloofendal_48d_partly_cloudy_puresky_1k.hdr` | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky (CC0, 2026-09-29 추가) |

## PBR textures (`assets/textures/`, diffuse + GL normal map)

| File prefix | Used for |
|-------------|----------|
| `leafy_grass` | witch ground |
| `asphalt_02` | road surface (all themes), NYC ground |
| `concrete_tile_facade` | NYC building facades |
| `dark_brick_wall` | witch gothic spires |
| `bark_brown_02` | witch dead trees |
| `plastered_stone_wall` | Joseon hanok walls |
| `grey_roof_tiles_02` | Joseon hanok roofs |
| `cobblestone_floor_08` | Joseon ground |
| `pine_bark` | Joseon pine trunks |
| `concrete_tile_facade` | overpass parapets and pillars (Village Highway track) |
| `cobblestone_floor_08` | downhill sidewalk (Village Highway track) |

Village-theme buildings, trees, bunting, curve signs and the start gate are generated in code (no downloaded assets).

## Photo-scanned props (`assets/models/<name>/`, glTF + textures)

| Model | Used for |
|-------|----------|
| `gothic_statue` | witch roadside statues |
| `dead_tree_trunk` | witch fallen logs |
| `street_lamp_02` | NYC street lamps |
| `Lantern_01` | Joseon lanterns |

Kart models (`models/`, `kenney_car-kit/`) are from Kenney (CC0) and are credited separately.
