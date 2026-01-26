import shutil
import os

src = r"e:\trickcal_story_guide\trickcal_images"
dst = r"e:\trickcal_story_guide\public\images"

def move_all(s_dir, d_dir):
    if not os.path.exists(d_dir):
        os.makedirs(d_dir)
    for item in os.listdir(s_dir):
        s_path = os.path.join(s_dir, item)
        d_path = os.path.join(d_dir, item)
        if os.path.isdir(s_path):
            move_all(s_path, d_path)
        else:
            shutil.copy2(s_path, d_path)
            # os.remove(s_path) # Let's copy first to be safe

move_all(src, dst)
print("Done")
