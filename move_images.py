import shutil
import os

src = r"e:\trickcal_story_guide\trickcal_images"
dst = r"e:\trickcal_story_guide\public\images"

if os.path.exists(src):
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            shutil.move(s, d)
        else:
            shutil.copy2(s, d)
    print("Files moved successfully.")
else:
    print("Source directory does not exist.")
