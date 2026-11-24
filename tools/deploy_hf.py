"""Unggah SITE CLASH ke Hugging Face Spaces (gratis, tanpa kartu kredit).

Pakai: klik dua kali DEPLOY_HF.bat (atau: python tools/deploy_hf.py).
Butuh token Hugging Face dengan izin "Write": https://huggingface.co/settings/tokens
Hasil: link tetap https://<username>-site-clash.hf.space yang bisa dibuka dari laptop/HP mana saja.
"""
import getpass
import os
import re
import subprocess
import sys

try:
    from huggingface_hub import HfApi
except ImportError:
    print('Memasang huggingface_hub (sekali saja)...')
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--quiet', 'huggingface_hub'])
    from huggingface_hub import HfApi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPACE = os.environ.get('HF_SPACE_NAME', 'site-clash')

SPACE_README = """---
title: SITE CLASH Laydown Legends
emoji: 🏗️
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

MOBA 3D bertema proyek EPC. Buka link `.hf.space` Space ini di browser laptop / HP (landscape) untuk bermain bersama teman.
"""


def main():
    token = os.environ.get('HF_TOKEN') or getpass.getpass('Tempel token Hugging Face (Write) lalu Enter (tidak tampil di layar): ').strip()
    api = HfApi(token=token)
    user = api.whoami()['name']
    repo = f'{user}/{SPACE}'
    print(f'Akun: {user}  ->  Space: {repo}')
    api.create_repo(repo, repo_type='space', space_sdk='docker', exist_ok=True)
    print('Mengunggah file game (pertama kali ±50 MB, berikutnya hanya yang berubah)...')
    api.upload_folder(
        repo_id=repo, repo_type='space', folder_path=ROOT,
        allow_patterns=['client/**', 'server/**', 'shared/**', 'package.json', 'package-lock.json', 'Dockerfile'],
        commit_message='Update SITE CLASH',
    )
    api.upload_file(path_or_fileobj=SPACE_README.encode('utf8'), path_in_repo='README.md', repo_id=repo, repo_type='space')
    host = re.sub(r'[^a-z0-9]+', '-', f'{user}-{SPACE}'.lower()).strip('-')
    print('\n' + '*' * 64)
    print(f'  Selesai! Hugging Face sedang membangun server (±3-5 menit).')
    print(f'  Status build : https://huggingface.co/spaces/{repo}')
    print(f'  LINK MAIN    : https://{host}.hf.space   <- kirim ke teman')
    print('*' * 64)


if __name__ == '__main__':
    main()
