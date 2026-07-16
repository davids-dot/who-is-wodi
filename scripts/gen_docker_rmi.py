#!/usr/bin/env python3
"""Parse docker images output and generate docker rmi command for old/duplicate images."""

import re
import sys
from collections import defaultdict

def parse_time_ago(time_str):
    """Convert relative time string to hours (for comparison)."""
    time_str = time_str.strip()
    # Handle "X years ago", "X months ago", "X weeks ago", "X days ago", "X hours ago", "X months ago"
    m = re.match(r'(\d+)\s*(year|month|week|day|hour)\w*\s*ago', time_str)
    if not m:
        return 0  # unknown, treat as newest
    num = int(m.group(1))
    unit = m.group(2)
    multipliers = {
        'year': 365 * 24,
        'month': 30 * 24,
        'week': 7 * 24,
        'day': 24,
        'hour': 1,
    }
    return num * multipliers[unit]

def parse_docker_images(filepath):
    """Parse docker images output file."""
    images = []
    with open(filepath) as f:
        for i, line in enumerate(f):
            line = line.strip()
            # Skip header and empty lines
            if not line or line.startswith('REPOSITORY') or line.startswith('docker images'):
                continue
            
            # Split by whitespace - but repository and tag can have spaces?
            # Format: REPOSITORY  TAG  IMAGE_ID  CREATED  SIZE
            # Repository has no spaces, tag has no spaces
            parts = line.split()
            if len(parts) < 5:
                continue
            
            # Find the image ID (12 hex chars)
            image_id = None
            image_id_idx = None
            for idx, part in enumerate(parts):
                if re.match(r'^[a-f0-9]{12}$', part):
                    image_id = part
                    image_id_idx = idx
                    break
            
            if not image_id:
                continue
            
            repo = parts[0]
            tag = parts[1] if image_id_idx == 2 else 'unknown'
            
            # CREATED is between image_id and size
            # Size is the last field
            created_parts = parts[image_id_idx + 1:-1]
            created = ' '.join(created_parts)
            size = parts[-1]
            
            hours_ago = parse_time_ago(created)
            
            images.append({
                'repo': repo,
                'tag': tag,
                'image_id': image_id,
                'created': created,
                'hours_ago': hours_ago,
                'size': size,
                'line': i + 1,
            })
    return images

def is_newer_version(tag1, tag2):
    """Compare version tags. Returns True if tag1 is newer than tag2."""
    # Extract version numbers
    def extract_ver(t):
        m = re.match(r'^(\d+)\.(\d+)\.(\d+)', t)
        if m:
            return tuple(int(x) for x in m.groups())
        return (0, 0, 0)
    
    v1 = extract_ver(tag1)
    v2 = extract_ver(tag2)
    return v1 > v2

def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else '/Users/zhaoyanchao/Code/fde/who_is_wodi/tmp.txt'
    images = parse_docker_images(filepath)
    
    # Separate dangling images (<none> tag)
    dangling = [img for img in images if img['tag'] == '<none>']
    tagged = [img for img in images if img['tag'] != '<none>']
    
    # Group tagged images by repository
    by_repo = defaultdict(list)
    for img in tagged:
        by_repo[img['repo']].append(img)
    
    # For each repo, decide what to keep and what to delete
    to_delete = []
    to_keep = []
    
    for repo, repo_images in sorted(by_repo.items()):
        # Sort by hours_ago ascending (newest first)
        repo_images.sort(key=lambda x: x['hours_ago'])
        
        # Keep the newest 1-2 images
        if len(repo_images) <= 1:
            to_keep.extend(repo_images)
            continue
        
        # Special handling for repos with commit-hash tags (like ns-robot)
        # Keep newest 3 for these
        if repo in ('ns-robot', 'swr.cn-north-4.myhuaweicloud.com/xbh/ns-robot'):
            keep_count = 6  # keep newest 6
        else:
            keep_count = 1  # keep only newest 1
        
        kept = repo_images[:keep_count]
        deleted = repo_images[keep_count:]
        
        to_keep.extend(kept)
        to_delete.extend(deleted)
    
    # Collect dangling image IDs (unique)
    dangling_ids = list(set(img['image_id'] for img in dangling))
    
    # Print summary
    print("=" * 80)
    print("DOCKER IMAGE CLEANUP PLAN")
    print("=" * 80)
    
    print(f"\n📊 Total images: {len(images)}")
    print(f"   - Dangling (<none> tag): {len(dangling)} ({len(dangling_ids)} unique IDs)")
    print(f"   - Tagged: {len(tagged)}")
    print(f"   - To KEEP: {len(to_keep)}")
    print(f"   - To DELETE (tagged): {len(to_delete)}")
    
    # Calculate approximate space saved
    delete_sizes = []
    for img in to_delete:
        size_str = img['size']
        if 'GB' in size_str:
            delete_sizes.append(float(size_str.replace('GB', '')))
        elif 'MB' in size_str:
            delete_sizes.append(float(size_str.replace('MB', '')) / 1024)
    
    print(f"   - Approx space to free (tagged only): ~{sum(delete_sizes):.1f} GB")
    
    print("\n" + "=" * 80)
    print("KEEP (newest per repo):")
    print("=" * 80)
    for img in sorted(to_keep, key=lambda x: x['repo']):
        print(f"  {img['repo']}:{img['tag']}  ({img['created']}, {img['size']})")
    
    print("\n" + "=" * 80)
    print("DELETE (old versions):")
    print("=" * 80)
    for img in sorted(to_delete, key=lambda x: x['repo']):
        print(f"  {img['repo']}:{img['tag']}  ({img['created']}, {img['size']})")
    
    # Generate the docker rmi command
    print("\n" + "=" * 80)
    print("DOCKER RMI COMMAND:")
    print("=" * 80)
    
    # For dangling images, use image IDs
    # For tagged images, use repo:tag
    rmi_targets = []
    
    # Add dangling image IDs
    for img_id in sorted(dangling_ids):
        rmi_targets.append(img_id)
    
    # Add old tagged images
    for img in sorted(to_delete, key=lambda x: (x['repo'], x['tag'])):
        rmi_targets.append(f"{img['repo']}:{img['tag']}")
    
    print(f"\ndocker image prune -f && docker rmi \\")
    # Print in chunks for readability
    for i in range(0, len(rmi_targets), 5):
        chunk = rmi_targets[i:i+5]
        line = '  ' + ' '.join(chunk)
        if i + 5 < len(rmi_targets):
            line += ' \\'
        print(line)
    
    print(f"\n# Total targets: {len(rmi_targets)} (dangling: {len(dangling_ids)}, tagged: {len(to_delete)})")

if __name__ == '__main__':
    main()
