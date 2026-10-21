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

# Рингтон: маримба-арпеджио (две фразы по четыре ноты).
N="exp(-mod(t,0.13)*22)"
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.5*$N*sin(2*PI*if(lt(mod(t,0.52),0.13),784,if(lt(mod(t,0.52),0.26),988,if(lt(mod(t,0.52),0.39),1175,1568)))*t)*lt(mod(t,1.3),1.04)':s=44100:d=2.6" \
  -af "afade=t=out:st=2.3:d=0.3" ring.wav

# Гудки после разговора.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.3*sin(2*PI*425*t)*lt(mod(t,0.4),0.2)':s=44100:d=1.2" hangup.wav

# «Бум» для панчлайнов: низкая нота с перегрузом.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.9*tanh(3*sin(2*PI*(38+70*exp(-t*9))*t))*exp(-t*2.6)':s=44100:d=1.4" boom.wav

# Глитч: рваный цифровой шум.
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.4*(random(0)*2-1)*gt(sin(2*PI*23*t),0.2)+0.3*(gt(sin(2*PI*180*t),0)*2-1)*lt(mod(t,0.11),0.04)':s=44100:d=0.6" \
  -af "acrusher=bits=4:samples=12" glitch.wav
