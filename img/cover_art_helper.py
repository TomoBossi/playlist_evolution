import os
from PIL import Image

def isSquare(img: tuple): # img is (filename, image)
    width, height = img[1].size
    return width == height

def smallestSize(file_img_array: list[tuple]):
    return min([min(img[1].size) for img in file_img_array])

def resizeImg(img: tuple, size: int, file_name_array: list[str], prev_sizes_array: list[int]):
    filename, image = img
    if filename.split("_")[-1][:-4] not in [str(prev) for prev in prev_sizes_array]:
        new_filename = filename[:-4] + "_" + str(size) + filename[-4:]
        if new_filename not in file_name_array:
            new_image = image.convert("RGB").resize((size, size))
            new_image.save(new_filename, quality = 95)

img_directory = "./img/cover_art/"
file_name_array = [img_directory + file_name for file_name in os.listdir(img_directory)]
file_img_array = [(f, Image.open(f)) for f in file_name_array]
sizes = [440, 50]
for counter, img in enumerate(file_img_array):
    # if img[0][:-4] + "_100" + img[0][-4:] in file_name_array: os.remove(img[0][:-4] + "_100" + img[0][-4:])
    resizeImg(img, 440, file_name_array, sizes)
    resizeImg(img, 50, file_name_array, sizes)
    print("(" + str(counter + 1) + "/" + str(len(file_img_array)) + ")", end = "\r")

# rectangularImgs = [file_name_array[i] for i in range(len(file_img_array)) if not isSquare(file_img_array[i])]
# print(rectangularImgs) # []
# print(all([isSquare(img) for img in file_img_array])) # True
# print(smallestSize(file_img_array)) # 440