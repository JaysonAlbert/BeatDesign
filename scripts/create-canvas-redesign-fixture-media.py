from PIL import Image, ImageDraw
from pathlib import Path
p=Path('data/redesign-fixture-media');p.mkdir(exist_ok=True)
for i in range(3):
 im=Image.new('RGB',(960,540),(227-i*8,212-i*5,188+i*8));d=ImageDraw.Draw(im)
 d.rectangle((0,350,960,540),fill=(162,137+i*9,106))
 d.rectangle((80,70,360,350),fill=(121,143+i*10,145));d.rectangle((98,88,342,332),fill=(189,211,211))
 d.line((220,88,220,332),fill=(235,225,209),width=14);d.line((98,200,342,200),fill=(235,225,209),width=14)
 d.polygon([(100,350),(350,350),(720,540),(410,540)],fill=(221,191,144))
 d.rounded_rectangle((480,265,850,435),22,fill=(157-i*10,151,134+i*9));d.rounded_rectangle((500,250,680,330),12,fill=(225,208,180))
 d.rectangle((790,155,805,300),fill=(91,84,69));d.polygon([(750,160),(845,160),(822,105),(773,105)],fill=(241,214,150))
 d.ellipse((380,330,435,385),fill=(107,133,103));d.rectangle((397,375,420,413),fill=(177,112,82))
 im.save(p/f'room-{i}.png')
