"""Unduh aset CC0 dari Poly Haven ke _vendor_assets/polyhaven (sumber; tidak di-commit).
Tekstur (diffuse, normal GL, ARM) disalin juga ke client/assets/tex sebagai JPG 1K, HDRI ke client/assets/env.
Jalankan: python tools/fetch_polyhaven.py
"""
import json, os, shutil, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_vendor_assets', 'polyhaven')
TEX_OUT = os.path.join(ROOT, 'client', 'assets', 'tex')
ENV_OUT = os.path.join(ROOT, 'client', 'assets', 'env')
UA = {'User-Agent': 'site-clash-game-dev'}

TEXTURES = ['cracked_concrete_02', 'damaged_concrete_floor', 'dirty_concrete', 'tarred_gravel', 'brown_mud_dry',
            'container_side', 'rusty_painted_metal', 'rusty_metal_02', 'rusty_corrugated_iron', 'metal_plate']
MODELS = ['Barrel_01', 'old_tyre', 'concrete_road_barrier', 'wooden_crate_02', 'trashbag', 'weed_plant_02', 'nettle_plant',
          'dandelion_01', 'grass_medium_01', 'grass_medium_02', 'shrub_sorrel_01', 'portable_generator', 'modular_chainlink_fence']
HDRI = 'industrial_sunset_02_puresky'


def api(asset):
    return json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + asset, headers=UA), timeout=60))


def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(dst + '.part', 'wb') as f:
        shutil.copyfileobj(r, f)
    os.replace(dst + '.part', dst)


def main():
    os.makedirs(TEX_OUT, exist_ok=True); os.makedirs(ENV_OUT, exist_ok=True)
    for t in TEXTURES:
        f = api(t)
        for key, short in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')):
            e = f[key]['1k']['jpg']
            dst = os.path.join(SRC, 'tex', t, f'{t}_{short}.jpg')
            get(e['url'], dst)
            shutil.copyfile(dst, os.path.join(TEX_OUT, f'{t}_{short}.jpg'))
        print('tex', t)
    for m in MODELS:
        g = api(m)['gltf']['1k']['gltf']
        base = os.path.join(SRC, 'models', m)
        get(g['url'], os.path.join(base, m + '.gltf'))
        for rel, e in g.get('include', {}).items():
            get(e['url'], os.path.join(base, rel.replace('/', os.sep)))
        print('model', m)
    h = api(HDRI)['hdri']['1k']['hdr']
    dst = os.path.join(SRC, 'hdri', HDRI + '_1k.hdr')
    get(h['url'], dst)
    shutil.copyfile(dst, os.path.join(ENV_OUT, 'sky_1k.hdr'))
    print('hdri', HDRI)


if __name__ == '__main__':
    main()
