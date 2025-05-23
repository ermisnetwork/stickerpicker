# Manual
This project is derived from [maunium/stickerpicker](https://github.com/maunium/stickerpicker), licensed under the GNU Affero General Public License v3.0.
## Setup

To set up the environment, run the following commands:

```bash
chmod +x setup.sh
./setup.sh
```

## Scripts

Before running any script, make sure to activate the virtual environment:

```bash
source .venv/bin/activate
```

### Add a New Sticker Pack

To add one or more sticker packs, run:

```bash
python -m sticker.stickerimport <link1> <link2> ...
```

### Remove a Sticker Pack

To remove a specific sticker pack, run:

```bash
python -m sticker.stickerremove <pack_name>
```

To remove **all** sticker packs, use:

```bash
python -m sticker.stickerremove --all
```
