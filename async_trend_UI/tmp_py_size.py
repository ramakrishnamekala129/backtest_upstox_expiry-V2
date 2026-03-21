import os

def get_size(start_path):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(start_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if not os.path.islink(fp):
                try:
                    total_size += os.path.getsize(fp)
                except Exception:
                    pass
    return total_size

sizes = []
pwd = os.getcwd()
for i in os.listdir(pwd):
    path = os.path.join(pwd, i)
    if os.path.isdir(path):
        sizes.append((i, get_size(path)))
    else:
        sizes.append((i, os.path.getsize(path)))

sizes.sort(key=lambda x: x[1], reverse=True)
with open('sizes_output_py.txt', 'w') as f:
    for name, size in sizes[:15]:
        line = f"{name}: {size / (1024*1024):.2f} MB\n"
        f.write(line)
