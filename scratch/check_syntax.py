import sys

with open(r'c:\Users\Meu Computador\Desktop\Projetos\GITHUB\GPS\Almoxarifado\index.html', 'rb') as f:
    content = f.read()

# Find the area around chamadosContent
# We know it's around line 4353-4420
# Let's just look for the string 'const chamadosContent'
start_index = content.find(b'const chamadosContent')
if start_index != -1:
    # Print 2000 bytes from there
    print(content[start_index:start_index+3000].decode('utf-8', errors='replace'))
else:
    print('Not found')
