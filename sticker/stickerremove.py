import json
import os
import sys
from pathlib import Path

def remove_sticker_pack(pack_name) -> None:
    """
    Remove a sticker pack and its associated thumbnails from the web/packs directory.
    Args:
        pack_name (str): The name of the sticker pack to remove (without .json extension).
    Returns:
        None
    """
    # Path to web/packs directory
    base_path = Path("web/packs")
    thumbnails_path = base_path / "thumbnails"
    
    # Check if web/packs directory exists
    if not base_path.exists() or not base_path.is_dir():
        print("The web/packs directory does not exist. Stopping script.")
        return

    # Path to index.json
    index_file = base_path / "index.json"

    # Step 1: Process index.json
    try:
        if index_file.exists():
            # Read index.json content
            with open(index_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check and remove pack_name from packs list
            if "packs" in data and isinstance(data["packs"], list):
                original_len = len(data["packs"])
                data["packs"] = [pack for pack in data["packs"] if pack != f"{pack_name}.json"]
                
                if len(data["packs"]) < original_len:
                    # Write back to index.json if packs list is not empty
                    if data["packs"]:
                        with open(index_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                            f.write('\n')  # Add newline at the end of file
                        print(f"Removed {pack_name}.json from index.json")
                    else:
                        # Delete index.json if packs list is empty
                        index_file.unlink()
                        print("No packs remain in index.json, deleted index.json")
                else:
                    print(f"Did not find {pack_name}.json in index.json")
        else:
            print("index.json not found, skipping this step.")
    except Exception as e:
        print(f"Error processing index.json: {e}, continuing...")

    # Step 2: Process pack file (e.g., MonoMemeee.json)
    pack_file = base_path / f"{pack_name}.json"
    try:
        if pack_file.exists():
            # Read pack file content
            with open(pack_file, 'r', encoding='utf-8') as f:
                pack_data = json.load(f)

            # Get stickers list
            stickers = pack_data.get("stickers", [])
            for sticker in stickers:
                telegram = sticker.get("telegram", {})
                sticker_id = telegram.get("id")
                if sticker_id:
                    # Find and delete matching files in thumbnails directory
                    for ext in ['webp', 'png', 'jpg', 'jpeg', 'gif']:  # Possible extensions
                        thumbnail_file = thumbnails_path / f"{sticker_id}.{ext}"
                        try:
                            if thumbnail_file.exists():
                                thumbnail_file.unlink()
                                print(f"Deleted {thumbnail_file}")
                        except Exception as e:
                            print(f"Error deleting {thumbnail_file}: {e}, continuing...")

            # Delete the pack file
            try:
                pack_file.unlink()
                print(f"Deleted {pack_file}")
            except Exception as e:
                print(f"Error deleting {pack_file}: {e}, continuing...")
        else:
            print(f"Did not find {pack_file}, skipping this step.")
    except Exception as e:
        print(f"Error processing {pack_file}: {e}, continuing...")

def remove_all_sticker_packs() -> None:
    """
    Remove all sticker packs and their associated thumbnails from the web/packs directory.
    Args:
        None
    Returns:
        None
    """
    # Path to web/packs directory
    base_path = Path("web/packs")
    thumbnails_path = base_path / "thumbnails"
    
    # Check if web/packs directory exists
    if not base_path.exists() or not base_path.is_dir():
        print("The web/packs directory does not exist. Stopping script.")
        return

    # Path to index.json
    index_file = base_path / "index.json"

    # Step 1: Process index.json
    try:
        if index_file.exists():
            # Read index.json content
            with open(index_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check and remove all packs
            if "packs" in data and isinstance(data["packs"], list):
                if data["packs"]:
                    data["packs"] = []
                    # Delete index.json if packs list is empty
                    index_file.unlink()
                    print("Removed all packs, deleted index.json")
                else:
                    print("No packs found in index.json")
        else:
            print("index.json not found, skipping this step.")
    except Exception as e:
        print(f"Error processing index.json: {e}, continuing...")

    # Step 2: Find and delete all pack files and thumbnails
    try:
        for pack_file in base_path.glob("*.json"):
            pack_name = pack_file.stem
            try:
                # Read pack file content
                with open(pack_file, 'r', encoding='utf-8') as f:
                    pack_data = json.load(f)

                # Get stickers list
                stickers = pack_data.get("stickers", [])
                for sticker in stickers:
                    telegram = sticker.get("telegram", {})
                    sticker_id = telegram.get("id")
                    if sticker_id:
                        # Find and delete matching files in thumbnails directory
                        for ext in ['webp', 'png', 'jpg', 'jpeg', 'gif']:  # Possible extensions
                            thumbnail_file = thumbnails_path / f"{sticker_id}.{ext}"
                            try:
                                if thumbnail_file.exists():
                                    thumbnail_file.unlink()
                                    print(f"Deleted {thumbnail_file}")
                            except Exception as e:
                                print(f"Error deleting {thumbnail_file}: {e}, continuing...")

                # Delete the pack file
                try:
                    pack_file.unlink()
                    print(f"Deleted {pack_file}")
                except Exception as e:
                    print(f"Error deleting {pack_file}: {e}, continuing...")
            except Exception as e:
                print(f"Error processing {pack_file}: {e}, continuing...")
    except Exception as e:
        print(f"Error processing pack files: {e}, continuing...")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m sticker.stickerremove <pack_name> or python -m sticker.stickerremove --all")
        print("Example: python -m sticker.stickerremove MonoMemeee")
        print("Example: python -m sticker.stickerremove --all")
        sys.exit(1)

    pack_name = sys.argv[1]
    print(f"Starting to remove sticker pack at 10:07 AM +07 on Friday, May 23, 2025")
    if pack_name == "--all":
        remove_all_sticker_packs()
    else:
        remove_sticker_pack(pack_name)
    print("Completed!")
