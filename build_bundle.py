"""
OpenRocket 3D Flight Visualizer - Standalone Bundle Builder
Concatenates ES modules and embeds simulation datasets into a single zero-CORS script.
"""

import json
import re

def build():
    with open('sim1.csv', 'r', encoding='utf-8') as f:
        sim1_text = f.read()

    with open('f32t no angle.csv', 'r', encoding='utf-8', errors='replace') as f:
        f32t_text = f.read()

    with open('data/default_flight.csv', 'r', encoding='utf-8') as f:
        default_text = f.read()

    with open('js/parser.js', 'r', encoding='utf-8') as f:
        parser_js = f.read().replace('export class OpenRocketParser', 'class OpenRocketParser')

    with open('js/visualizer.js', 'r', encoding='utf-8') as f:
        vis_js = f.read().replace('export class RocketVisualizer', 'class RocketVisualizer')

    with open('js/audio.js', 'r', encoding='utf-8') as f:
        audio_js = f.read().replace('export class FlightAudioManager', 'class FlightAudioManager')

    with open('js/ui.js', 'r', encoding='utf-8') as f:
        ui_js = f.read().replace('export class UIController', 'class UIController')

    with open('js/main.js', 'r', encoding='utf-8') as f:
        main_js = f.read()
    main_js_clean = re.sub(r'import\s+.*?;\s*', '', main_js)

    bundle_content = f'''/**
 * OpenRocket 3D Flight Visualizer - Standalone Bundle
 * Offline and zero-CORS ready for file:// and http://
 */

const DEFAULT_FLIGHT_CSV = {json.dumps(default_text)};
const SIM1_CSV = {json.dumps(sim1_text)};
const F32T_CSV = {json.dumps(f32t_text)};

{parser_js}

{vis_js}

{audio_js}

{ui_js}

{main_js_clean}
'''

    with open('js/app.js', 'w', encoding='utf-8') as f:
        f.write(bundle_content)

    print(f"Bundle updated: js/app.js ({len(bundle_content)} bytes)")

if __name__ == "__main__":
    build()

