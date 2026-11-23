# Spesifikasi visual 20 hero SITE CLASH (dari concept art di folder proyek).
# Warna hex sRGB. sleeve: none | short | rolled | long
# hat: hardhat | weld | hijab | cap | None ; hair: nama Hair_*.gltf (tanpa prefix) atau None
# build: bulk (kekar + / kurus -), belly (gendut), height (tinggi), chest, legs
# gear: pouches, backpack, earmuffs, mask, pauldrons, cargo, apron, bands, kneepads, scarf, legstraps, longcoat

HEROES = {
    # Fighter kekar
    'structural': dict(g='M', skin=(0.86, 0.70, 0.56), shirt='#34507a', plaid=('#22324d', '#9a2f2f'), sleeve='rolled', pants='#8b7752', boots='#5a3a1e',
                       hat='hardhat', hat_col='#eeeeee', hair='Buzzed', straps='#d9a21b', belt='#3a2a1a', tool='beam', tool_l='scroll',
                       build=dict(bulk=0.2, height=1.03), gear=('pouches', 'cargo', 'kneepads')),
    # Support sedang, sedikit berisi
    'hse':        dict(g='M', skin=(0.80, 0.62, 0.48), shirt='#f2f2ee', sleeve='long', vest='#b6ff3c', reflect=True, pants='#2a3040', boots='#1e1e1e',
                       hat='hardhat', hat_col='#d42a2a', hat_stripe='#ffffff', hair='Buzzed', belt='#222222', tool='baton', tool_l='medkit',
                       build=dict(bulk=-0.05, belly=0.2, height=0.99), gear=('bands', 'pouches')),
    # Assassin kecil kurus
    'drafter':    dict(g='M', skin=(0.84, 0.68, 0.54), shirt='#7f8a99', sleeve='rolled', pants='#2d3240', boots='#151515', shoes=True,
                       hat=None, hair='SimpleParted', hair_col='#1a1410', glasses=True, lanyard='#3fd2ff', belt='#1a1a1a', tool='stylus',
                       build=dict(bulk=-0.22, height=0.92), gear=('backpack', 'scarf'), scarf_col='#3fd2ff'),
    'qs':         dict(g='F', skin=(0.86, 0.70, 0.58), shirt='#f4f1e6', sleeve='long', tie='#1d2a4a', pants='#232a3a', boots='#111111', shoes=True,
                       hat=None, hair='Buns', hair_col='#2a1a12', glasses=True, lanyard='#e0b23a', belt='#1a1a1a', tool='calculator', tool_l='docs',
                       build=dict(bulk=-0.12, height=0.95), vest='#3a3f52'),
    # Marksman tinggi kurus
    'surveyor':   dict(g='M', skin=(0.72, 0.54, 0.40), shirt='#6a6f66', sleeve='long', vest='#f07a1a', reflect=True, pants='#8b7752', boots='#4a3018',
                       hat='hardhat', hat_col='#f6c21b', hair='Buzzed', belt='#3a2a1a', tool='theodolite_tab', back='theodolite',
                       build=dict(bulk=-0.16, height=1.09), gear=('cargo', 'bands', 'scarf'), scarf_col='#c8b58a'),
    'architect':  dict(g='M', skin=(0.88, 0.72, 0.58), shirt='#1c1c1c', sleeve='long', jacket='#7d7f86', pinstripe='#9a9ca4', pants='#2a2c33', boots='#141414', shoes=True,
                       hat=None, hair='SimpleParted', hair_col='#241a14', glasses=True, lanyard='#c9a227', belt='#141414', tool='pencil', tool_l='tube',
                       build=dict(bulk=-0.14, height=1.07), gear=('longcoat', 'scarf'), scarf_col='#c9a227'),
    # Tank raksasa gendut kekar
    'fabricator': dict(g='M', skin=(0.70, 0.52, 0.38), shirt='#1f2f4a', sleeve='short', pants='#1f2f4a', boots='#2a1c10', gloves='#7a5230',
                       hat='weld', hat_col='#2b2b2b', hair='Beard', belt='#3a2a1a', tool='sledge',
                       build=dict(bulk=0.3, belly=0.4, height=1.07), gear=('apron', 'pauldrons', 'kneepads')),
    # Gendut pendek
    'plumbing':   dict(g='M', skin=(0.80, 0.62, 0.47), shirt='#2a3f66', sleeve='rolled', vest='#3a3a3a', pants='#24324e', boots='#2a1c10',
                       hat='hardhat', hat_col='#f0f0f0', hair='Beard', belt='#2a2a2a', tool='wrench',
                       build=dict(bulk=0.1, belly=0.65, height=0.93), gear=('pouches', 'kneepads')),
    'electrical': dict(g='M', skin=(0.82, 0.64, 0.50), shirt='#24365a', sleeve='long', pants='#24365a', boots='#1e1e1e', gloves='#e8731a',
                       hat='hardhat', hat_col='#f0f0f0', hair='Buzzed', belt='#1e1e1e', tool='testpen', tool_l='multimeter',
                       build=dict(bulk=-0.06, height=1.0), gear=('bands', 'pouches', 'legstraps'), straps='#e8731a'),
    # Kecil kurus
    'electronic': dict(g='M', skin=(0.90, 0.75, 0.62), shirt='#9aa3ad', sleeve='short', pants='#2b3038', boots='#151515', shoes=True,
                       hat=None, hair='SimpleParted', hair_col='#1a1410', visor='#3fd2ff', lanyard='#3fd2ff', belt='#1a1a1a', tool='pcb', tool_l='laptop',
                       build=dict(bulk=-0.25, height=0.9), gear=('backpack',), vest='#2f3640'),
    'sales':      dict(g='F', skin=(0.90, 0.74, 0.62), shirt='#f6f6f6', sleeve='long', jacket='#1d2a4a', pinstripe='#3a4a72', pants='#1d2a4a', boots='#0e0e0e', shoes=True,
                       hat=None, hair='Long', hair_col='#2a1a12', lanyard='#c9a227', belt='#0e0e0e', tool='card', tool_l='briefcase',
                       build=dict(bulk=-0.1, height=1.03), gear=('scarf',), scarf_col='#b02a3a'),
    # Gendut besar
    'supervisor': dict(g='M', skin=(0.74, 0.56, 0.41), shirt='#b09a6a', sleeve='rolled', vest='#6b5a3a', pockets=True, pants='#5a4a32', boots='#3a2714',
                       hat='hardhat', hat_col='#f6c21b', hair='Beard', belt='#2a1c10', tool='radio', tool_l='scroll',
                       build=dict(bulk=0.15, belly=0.55, height=1.02), gear=('cargo',)),
    'procurement':dict(g='M', skin=(0.84, 0.68, 0.54), shirt='#9fc3e8', sleeve='rolled', pants='#24324e', boots='#141414', shoes=True,
                       hat=None, hair='SimpleParted', hair_col='#221812', lanyard='#e0b23a', belt='#141414', tool='tablet',
                       build=dict(bulk=-0.05, belly=0.35, height=0.94), gear=('backpack',)),
    # Tinggi kurus
    'qaqc':       dict(g='M', skin=(0.82, 0.66, 0.52), shirt='#f2f2ee', sleeve='long', vest='#24365a', reflect=True, pants='#2a3040', boots='#1e1e1e', gloves='#f0f0f0',
                       hat='hardhat', hat_col='#f0f0f0', hair='Buzzed', glasses=True, belt='#1e1e1e', tool='scanner', tool_l='caliper',
                       build=dict(bulk=-0.18, height=1.08), gear=('mask', 'bands')),
    'commissioning': dict(g='M', skin=(0.78, 0.60, 0.46), shirt='#3a4a66', sleeve='long', jacket='#24304a', pants='#24304a', boots='#1a1a1a',
                       hat='hardhat', hat_col='#f0f0f0', hair='Buzzed', glasses=True, belt='#1a1a1a', tool='panel',
                       build=dict(bulk=0.08, height=1.0), gear=('earmuffs', 'bands', 'cargo')),
    # Raksasa kekar
    'crane':      dict(g='M', skin=(0.68, 0.50, 0.36), shirt='#b8321f', sleeve='none', vest='#f07a1a', reflect=True, straps='#222222', pants='#3a3a3a', boots='#2a1c10', gloves='#7a5230',
                       hat='hardhat', hat_col='#e64a19', hat_stripe='#ffffff', hair='Beard', belt='#222222', tool='hook', tool_l='remote',
                       build=dict(bulk=0.38, belly=0.2, height=1.12), gear=('legstraps', 'kneepads', 'pauldrons')),
    # Kekar pendek gempal
    'geotech':    dict(g='M', skin=(0.72, 0.53, 0.38), shirt='#8a6a40', sleeve='rolled', vest='#5a4a30', pockets=True, pants='#6a5638', boots='#3a2714',
                       hat='hardhat', hat_col='#c9b58a', hair='Beard', belt='#2a1c10', tool='sptrod',
                       build=dict(bulk=0.32, belly=0.3, height=0.95), gear=('backpack', 'kneepads', 'scarf'), scarf_col='#7a2f1f'),
    'hvac':       dict(g='M', skin=(0.84, 0.67, 0.52), shirt='#a9cfe8', sleeve='short', vest='#24365a', pants='#2a3a55', boots='#1e1e1e',
                       hat='hardhat', hat_col='#f0f0f0', hair='Buzzed', belt='#1e1e1e', tool='manifold',
                       build=dict(belly=0.48, height=0.99), gear=('pouches', 'earmuffs')),
    # Kecil
    'doccontrol': dict(g='F', skin=(0.86, 0.70, 0.58), shirt='#f6f6f6', sleeve='long', jacket='#1d2a4a', pants='#1d2a4a', boots='#0e0e0e', shoes=True,
                       hat='hijab', hat_col='#1d2a4a', hair=None, glasses=True, lanyard='#3fd2ff', belt='#0e0e0e', tool='stamp', tool_l='binder',
                       build=dict(bulk=-0.08, belly=0.12, height=0.9), gear=('longcoat',)),
    # Tinggi tegap
    'pm':         dict(g='M', skin=(0.82, 0.66, 0.52), shirt='#f4f4f0', sleeve='rolled', tie='#8a1d1d', pants='#232a3a', boots='#121212', shoes=True,
                       hat='hardhat', hat_col='#ffffff', hair='SimpleParted', belt='#121212', tool='pointer', tool_l='tablet',
                       build=dict(bulk=0.1, belly=0.12, height=1.1), vest='#232a3a'),
}
