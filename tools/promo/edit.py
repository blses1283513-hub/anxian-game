# builds promo_16x9.mp4 and promo_9x16.mp4 from rendered frames, UI captures and the game's own audio
import subprocess,os,sys
FONT='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
BG='0x0b141a'
os.makedirs('build',exist_ok=True);os.makedirs('build/txt',exist_ok=True)
# (clip, kind, seconds, captions)  caption = (start, end, text, style)
TL=[('dark','3d',4,[(.3,1.8,'16 個人。','big'),(1.9,3.9,'誰在說謊？','big')]),
    ('title','3d',4,[(.2,3.9,'暗線遊戲室','title'),(.6,3.9,'給一群朋友的手機推理遊戲','titlesub')]),
    ('orbit','3d',4,[(.2,3.9,'16 人同場・每人一支手機','main'),(.5,3.9,'打開瀏覽器就能玩，不用下載','sub')]),
    ('faces','3d',3,[(.2,2.9,'每個人的造型、座號都不同','main')]),
    ('walk','3d',3.5,[(.2,3.4,'在 3D 建築裡自由走動','main')]),
    ('gun','3d',3,[(.2,2.9,'技能藏在動作裡','main')]),
    ('give','3d',1.1,[(0,1.1,'只有你知道，哪一個動作會發動','main')]),
    ('tea','3d',1.1,[(0,1.1,'只有你知道，哪一個動作會發動','main')]),
    ('light','3d',1.3,[(0,1.2,'只有你知道，哪一個動作會發動','main')]),
    ('ui','ui',4,[(.2,3.9,'手機就是你的秘密身分卡','main')]),
    ('scan','3d',5,[(2.0,4.9,'小雨 使用感染檢測儀：已感染','game'),(.2,4.9,'病毒在擴散，檢測結果所有人都看得到','main')]),
    ('shot2','3d',4,[(.2,2.9,'最後一分鐘','main')]),
    ('ghost','3d',4,[(.2,3.9,'出局了？化身幽靈看完全場','main')]),
    ('chase','ui',4,[(.2,3.9,'第二款：地鐵追捕','main'),(.5,3.9,'小偷對三隊警察，警隊裡藏著內鬼','sub')]),
    ('results','3d',5,[(.4,4.9,'市民陣營獲勝！','main')]),
    ('end','end',6,[(.3,6,'暗線遊戲室','endtitle'),(.8,6,'今晚，找朋友來一局','endline'),(1.3,6,'anxian-game.onrender.com','endurl'),(1.6,6,'免下載・免註冊・6–16 人','endsmall')])]
UI={'ui':['ui/idcard.png','ui/pick.png'],'chase':['ui/chase.png','ui/chase2.png']}
def run(cmd):
    r=subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode:print(' '.join(cmd)[:400]);print(r.stderr[-2500:]);sys.exit(1)
def styles(W,H):
    P=H>W;m=min(W,H)
    return {'big':dict(fs=int(m*.13),y='(h-text_h)/2',c='white'),
     'title':dict(fs=int(m*.14),y='(h-text_h)/2-%d'%int(m*.06),c='0xf1cf63'),
     'titlesub':dict(fs=int(m*.05),y='(h-text_h)/2+%d'%int(m*.08),c='white'),
     'main':dict(fs=int(m*.072),y=('h*0.76' if P else 'h-%d'%int(m*.25)),c='white'),
     'sub':dict(fs=int(m*.045),y=('h*0.76+%d'%int(m*.1) if P else 'h-%d'%int(m*.13)),c='0xdfe7ea'),
     'game':dict(fs=int(m*.04),y=('h*0.18' if P else '%d'%int(m*.06)),c='0xf1cf63',box=1,x='%d'%int(m*.05)),
     'endtitle':dict(fs=int(m*.15),y='h*0.30',c='0xf1cf63'),
     'endline':dict(fs=int(m*.07),y='h*0.30+%d'%int(m*.2),c='white'),
     'endurl':dict(fs=int(m*.055),y='h*0.30+%d'%int(m*.32),c='0x7fe8cf'),
     'endsmall':dict(fs=int(m*.04),y='h*0.30+%d'%int(m*.43),c='0xdfe7ea')}
def dt(i,cap,st,W=1280):
    a,b,text,sty=cap;s=st[sty]
    if len(text)*s['fs']>W*.9 and not s.get('box'):                      # too wide for the frame: two lines, broken at the comma if there is one
        k=text.find('，')+1 if '，' in text else len(text)//2;l1,l2=text[:k],text[k:]
        s1=dict(s);s2=dict(s);s2['y']=f"({s['y']})+{int(s['fs']*1.3)}";st2=dict(st);st2['_1']=s1;st2['_2']=s2
        return dt(i,(a,b,l1,'_1'),st2,W)+','+dt(i,(a,b,l2,'_2'),st2,W)
    fn=f'build/txt/{i}_{abs(hash(text))%99999}.txt';open(fn,'w',encoding='utf-8').write(text)
    x=s.get('x','(w-text_w)/2')
    alpha=f"if(lt(t,{a}+0.25),(t-{a})/0.25,if(gt(t,{b}-0.25),({b}-t)/0.25,1))"
    box=f":box=1:boxcolor={BG}@0.85:boxborderw={int(s['fs']*.45)}" if s.get('box') else ''
    return (f"drawtext=fontfile={FONT}:textfile={fn}:fontsize={s['fs']}:fontcolor={s['c']}:x={x}:y={s['y']}:borderw={max(3,s['fs']//14)}:bordercolor=black@0.85"
            f"{box}:alpha='{alpha}':enable='between(t,{a},{b})'")
def clip(i,name,kind,sec,caps,shape,W,H):
    out=f'build/{shape}_{i:02d}_{name}.mp4';st=styles(W,H);n=int(round(sec*24))
    fl=[]
    if kind in('3d','end'):
        inp=['-framerate','24','-i',f'frames/{shape}-{name if kind=="3d" else "end"}/%04d.jpg']
        fl.append(f'scale={W}:{H},setsar=1')
        if kind=='end':fl.append('eq=brightness=-0.18:saturation=0.8,boxblur=3:1')
        tag=f"drawtext=fontfile={FONT}:text='示意畫面':fontsize={int(min(W,H)*.03)}:fontcolor=white@0.7:x=w-text_w-{int(min(W,H)*.04)}:y={int(min(W,H)*.04)}"
        if kind=='3d':fl.append(tag)
    else:
        imgs=UI[name];half=n//2
        P=H>W;iw=int(W*.92) if not P else int(W*.94);ih=int(iw*390/844)
        inp=[];parts=[]
        for k,im in enumerate(imgs):
            inp+=['-loop','1','-t',str(sec/2+.1),'-i',im]
            y='(oh-ih)/2' if not P else str(int(H*.36))
            parts.append(f"[{k}:v]scale={iw}:{ih},pad={W}:{H}:(ow-iw)/2:{y}:color={BG},zoompan=z='1+0.0009*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={half}:s={W}x{H}:fps=24,setsar=1[u{k}]")
        fl=None
        fc=';'.join(parts)+f';[u0][u1]concat=n=2:v=1:a=0[uv];[uv]'+','.join(dt(i,c,st,W) for c in caps)+'[v]'
        run(['ffmpeg','-y','-loglevel','error',*inp,'-filter_complex',fc,'-map','[v]','-frames:v',str(n),'-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',out]);return out
    fl+= [dt(i,c,st,W) for c in caps]
    if i==0:fl.append('fade=t=in:st=0:d=0.4')
    if kind=='end':fl.append(f'fade=t=out:st={sec-0.8}:d=0.8')
    run(['ffmpeg','-y','-loglevel','error',*inp,'-vf',','.join(fl),'-frames:v',str(n),'-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',out]);return out
def audio(total,out):
    T=[];t=0
    for name,kind,sec,_ in TL:T.append((name,t));t+=sec
    at=dict(T)
    # (file, start in the video, from, length, volume, fade in, fade out)
    P=[('music_brief',0,0,3.25,1.0,.5,.05),('sfx_gun',3.25,0,2.2,0.9,0,.4),
       ('sfx_bell',at['title'],0,2.5,0.7,0,.5),('music_day',at['title'],0,at['ui']-at['title']+1,1.0,.3,1.0),
       ('sfx_shuffle',at['ui'],0,1.5,0.8,0,.3),('music_lobby',at['ui']+.5,0,4,0.7,.5,.6),
       ('music_urgent',at['scan'],0,at['ghost']-at['scan']-.6,1.0,.4,.4),('sfx_heartbeat',at['shot2']+.2,0,3.2,1.0,0,.3),
       ('sfx_gun',at['shot2']+3.1,0,2.0,1.0,0,.4),('music_brief',at['ghost'],1.0,4.2,0.9,.6,.5),
       ('music_chase_cop',at['chase'],0,4.2,1.0,.3,.4),('sfx_cheer',at['results']+.3,0,3,0.9,0,.6),
       ('music_win_citizen',at['results'],0,total-at['results'],1.0,.3,1.2)]
    inp=[];fl=[];lab=[]
    for k,(f,st,fr,ln,vol,fi,fo) in enumerate(P):
        inp+=['-i',f'audio/{f}.wav'];d=int(st*1000)
        fl.append(f"[{k}:a]atrim={fr}:{fr+ln},asetpts=PTS-STARTPTS,afade=t=in:st=0:d={max(fi,.01)},afade=t=out:st={max(0,ln-fo)}:d={max(fo,.01)},volume={vol},adelay={d}|{d}[a{k}]");lab.append(f'[a{k}]')
    fl.append(''.join(lab)+f'amix=inputs={len(lab)}:normalize=0:duration=longest,atrim=0:{total},loudnorm=I=-15:TP=-1.5:LRA=11[out]')
    run(['ffmpeg','-y','-loglevel','error',*inp,'-filter_complex',';'.join(fl),'-map','[out]','-ar','48000','-c:a','aac','-b:a','192k',out])
for shape,(W,H),final in (('L',(1280,720),'promo_16x9.mp4'),('P',(720,1280),'promo_9x16.mp4')):
    if len(sys.argv)>1 and sys.argv[1]!=shape:continue
    clips=[clip(i,*row,shape,W,H) for i,row in enumerate(TL)]
    open(f'build/{shape}_list.txt','w').write(''.join(f"file '{os.path.basename(c)}'\n" for c in clips))
    run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',f'build/{shape}_list.txt','-c','copy',f'build/{shape}_video.mp4'])
    total=sum(r[2] for r in TL);audio(total,f'build/{shape}_audio.m4a')
    run(['ffmpeg','-y','-loglevel','error','-i',f'build/{shape}_video.mp4','-i',f'build/{shape}_audio.m4a','-c:v','copy','-c:a','copy','-shortest','-movflags','+faststart',final])
    print('built',final,total,'s')
