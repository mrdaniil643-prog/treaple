#!/usr/bin/env bash
# Синтезирует фоновый бит и звуковые эффекты через ffmpeg (без внешних файлов).
set -euo pipefail
cd "$(dirname "$0")/../public/sfx"
P=0.5455 # 110 BPM

# Бит: бочка на долю, хэт на слабую долю, тихий пэд.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='\
0.9*sin(2*PI*(45+110*exp(-mod(t,$P)*28))*mod(t,$P))*exp(-mod(t,$P)*8)\
+0.18*(random(0)*2-1)*exp(-mod(t+$P/2,$P)*70)\
+0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.6+0.4*sin(2*PI*t/(4*$P)))'\
:s=44100:d=32" -af "highpass=f=30,lowpass=f=9000,afade=t=in:d=0.3,afade=t=out:st=30:d=2" beat.wav

# Вжух для смены сцен.
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.6" \
  -af "bandpass=f=1800:w=1500,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.25" whoosh.wav

# Поп для появления объектов.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.7*sin(2*PI*(300+900*exp(-t*40))*t)*exp(-t*30)':s=44100:d=0.15" pop.wav

# Клик кнопки.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.8*(random(0)*2-1)*exp(-t*300)+0.5*sin(2*PI*1500*t)*exp(-t*80)':s=44100:d=0.08" click.wav

# Ошибка: короткий низкий «бзз».
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.35*(gt(sin(2*PI*110*t),0)*2-1)*exp(-t*6)':s=44100:d=0.3" error.wav

# Сирена для падения прода.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.3*(gt(sin(2*PI*(700+250*sin(2*PI*3*t))*t),0)*2-1)':s=44100:d=1.2" \
  -af "afade=t=out:st=0.9:d=0.3,lowpass=f=4000" alarm.wav

# Победный «динь».
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.4*(sin(2*PI*1046*t)+0.6*sin(2*PI*1568*t))*exp(-t*5)':s=44100:d=0.8" ding.wav
