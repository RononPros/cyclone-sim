// Canvas controls for the basin-wide SST offset and stationary warm/cold pools.
const TemperatureEditor = (()=>{
    const A=TemperatureAdjustments;
    let panel,sliders=[],drag,preview,selectedId=null,mode='warm';
    let brush={anomaly:3,radiusKm:500},status='',suppressClick=false;
    const touchCanvases=new WeakSet();
    const basin=()=>UI.viewBasin;
    const current=()=>basin() instanceof Basin && basin().viewingPresent();
    const editable=()=>current() && paused && !waitingFor;
    const state=()=>basin() ? A.stateAt(basin(),viewTick) : {globalOffset:0,bubbles:[]};
    const selected=()=>basin() && state().bubbles.find(b=>b.id===selectedId);
    const signed=value=>(value>=0?'+':'')+value.toFixed(1);
    const visible=()=>!basin() || !basin().temperatureAdjustments || basin().temperatureAdjustments.showBubbles!==false;
    const panelOpen=()=>!!(panel && panel.showing && primaryWrapper.showing);
    const isShowing=el=>{
        for(let u=el;u;u=u.parent) if(!u.showing) return false;
        return true;
    };
    const redraw=()=>{
        if(basin() && basin().env) basin().env.displayLayer();
    };
    const changed=message=>{status=message;redraw();};

    function createSlider(parent,x,y,width,height,descriptor){
        const el=parent.append(false,x,y,width,height,function(s){
            const enabled=!descriptor.enabled || descriptor.enabled();
            const value=drag && drag.slider===el ? drag.value : descriptor.get();
            noStroke();
            fill(24,30,45,235);
            s.fullRect();
            fill(enabled ? 238 : 135,enabled ? 244 : 145,enabled ? 255 : 160);
            textStyle(NORMAL);
            textAlign(CENTER,TOP);
            textSize(13);
            text(descriptor.label+': '+(descriptor.unit==='°C'?signed(value):Math.round(value))+' '+descriptor.unit,width/2,3);
            stroke(enabled ? 130 : 65,enabled ? 146 : 70,enabled ? 170 : 80);
            strokeWeight(3);
            line(14,29,width-14,29);
            if(descriptor.min<0 && descriptor.max>0){
                const zero=map(0,descriptor.min,descriptor.max,14,width-14);
                strokeWeight(1);
                line(zero,24,zero,34);
            }
            const knob=map(value,descriptor.min,descriptor.max,14,width-14,true);
            stroke(enabled ? 238 : 135,enabled ? 244 : 145,enabled ? 255 : 160);
            strokeWeight(9);
            point(knob,29);
            strokeWeight(1);
        },true);
        el.temperatureSlider=descriptor;
        sliders.push(el);
        return el;
    }

    function sliderValue(el){
        const d=el.temperatureSlider;
        const fraction=constrain((getMouseX()-el.getX()-14)/(el.width-28),0,1);
        const raw=d.min+fraction*(d.max-d.min);
        return Number((Math.round(raw/d.step)*d.step).toFixed(1));
    }

    function project(mapType,coord,anchor){
        const bounds=MAP_TYPES[MAP_TYPES[mapType].form==='earth'?mapType:6];
        const west=bounds.west,east=bounds.east<west?bounds.east+360:bounds.east;
        const reference=anchor===undefined?(west+east)/2:anchor;
        const longitude=coord.longitude+360*Math.round((reference-coord.longitude)/360);
        return {x:(longitude-west)/(east-west)*WIDTH,
            y:(coord.latitude-bounds.north)/(bounds.south-bounds.north)*HEIGHT,longitude};
    }

    function destination(center,radiusKm,bearing){
        const lat=center.latitude*Math.PI/180,lon=center.longitude*Math.PI/180;
        const distance=radiusKm/6371;
        const latitude=Math.asin(Math.sin(lat)*Math.cos(distance)+Math.cos(lat)*Math.sin(distance)*Math.cos(bearing));
        const longitude=lon+Math.atan2(Math.sin(bearing)*Math.sin(distance)*Math.cos(lat),
            Math.cos(distance)-Math.sin(lat)*Math.sin(latitude));
        return {latitude:latitude*180/Math.PI,longitude:longitude*180/Math.PI};
    }

    function renderOverlay(){
        const b=basin();
        if(!(b instanceof Basin) || !visible() || !land || !land.drawn) return;
        const bubbles=state().bubbles.map(item=>preview && item.id===preview.id ? preview.bubble : item);
        if(preview && preview.type==='new') bubbles.push(preview.bubble);
        if(!bubbles.length) return;
        push();
        const ctx=typeof drawingContext==='undefined'?null:drawingContext;
        if(ctx){ctx.save();ctx.beginPath();ctx.rect(0,30,WIDTH,HEIGHT-60);ctx.clip();}
        for(const bubble of bubbles){
            const centre=project(b.mapType,bubble);
            const warm=bubble.anomaly>=0;
            const rgb=warm?[255,117,100]:[78,207,255];
            fill(...rgb,22);
            stroke(...rgb,210);
            strokeWeight(bubble.id===selectedId && panelOpen()?2.5:1.3);
            beginShape();
            for(let i=0;i<=96;i++){
                const p=project(b.mapType,destination(bubble,bubble.radiusKm,i*2*Math.PI/96),centre.longitude);
                vertex(p.x,p.y);
            }
            endShape(CLOSE);
            if(centre.x<0 || centre.x>=WIDTH || centre.y<30 || centre.y>=HEIGHT-30) continue;
            noStroke();
            fill(...rgb,235);
            ellipse(centre.x,centre.y,6,6);
            textSize(12);
            textStyle(BOLD);
            const label=signed(bubble.anomaly)+'°C';
            const width=textWidth(label)+12;
            const labelX=constrain(centre.x+9,3,WIDTH-width-3);
            const labelY=constrain(centre.y-24,32,HEIGHT-49);
            fill(12,18,30,225);
            rect(labelX,labelY,width,19,4);
            fill(...rgb);
            textAlign(LEFT,CENTER);
            text(label,labelX+6,labelY+9);
        }
        if(ctx) ctx.restore();
        pop();
    }

    function mapPoint(){
        const x=getMouseX(),y=getMouseY();
        return x>=0 && x<WIDTH && y>=30 && y<HEIGHT-30 && UI.mouseOver===primaryWrapper;
    }

    function oceanPoint(){
        if(!mapPoint()) return null;
        const coord=Coordinate.convertFromXY(basin().mapType,getMouseX(),getMouseY());
        return land && !land.get(coord) ? coord : null;
    }

    function pickBubble(coord){
        let nearest=null,best=Infinity;
        for(const bubble of state().bubbles){
            const q=A.distanceKm(coord,bubble)/bubble.radiusKm;
            if(q<=1 && q<best){nearest=bubble;best=q;}
        }
        return nearest;
    }

    function toggleVisible(){
        if(!(basin() instanceof Basin)) return;
        A.setVisible(basin(),!visible());
        status=visible()?'Bubble outlines shown.':'Outlines hidden; temperatures still apply.';
    }

    function open(){
        if(!(basin() instanceof Basin) || !panel) return;
        paused=true;
        selectedId=null;mode=brush.anomaly<0?'cold':'warm';drag=preview=undefined;status='';
        selectStorm();
        refreshTracks(true);
        sideMenu.hide();helpBox.hide();seedBox.hide();
        panel.show();
    }

    function close(){
        if(panel) panel.hide();
        drag=preview=undefined;selectedId=null;
    }

    function button(parent,x,y,w,label,action,enabled=()=>true,active=()=>false){
        return parent.append(false,x,y,w,27,function(s){
            s.button(typeof label==='function'?label():label,true,13,!enabled());
            if(active()){
                noFill();stroke(101,209,255);strokeWeight(2);
                rect(0,0,this.width,this.height);strokeWeight(1);
            }
        },()=>{if(enabled()) action();});
    }

    function bindTouch(){
        const canvas=typeof document.querySelector==='function' && document.querySelector('canvas.p5Canvas');
        if(!canvas || touchCanvases.has(canvas)) return;
        touchCanvases.add(canvas);
        let active=false;
        const position=event=>{
            const touch=event.touches[0] || event.changedTouches[0];
            if(!touch) return;
            const bounds=canvas.getBoundingClientRect();
            mouseX=(touch.clientX-bounds.left)*canvas.width/bounds.width;
            mouseY=(touch.clientY-bounds.top)*canvas.height/bounds.height;
        };
        // p5 1.9 forwards touch movement to mouseDragged, but not touch start/end
        // to the corresponding mouse callbacks. Handle only gestures claimed by
        // a slider or the editor map; ordinary menu taps keep their native click.
        canvas.addEventListener('touchstart',event=>{
            position(event);
            if(event.touches.length===1 && window.mousePressed(event)===false){
                active=true;event.preventDefault();
            }
        },{passive:false});
        canvas.addEventListener('touchend',event=>{
            if(active){position(event);active=false;window.mouseReleased(event);event.preventDefault();}
        },{passive:false});
        canvas.addEventListener('touchcancel',event=>{
            if(active){
                active=false;drag=preview=undefined;suppressClick=false;
                window.mouseReleased(event);event.preventDefault();
            }
        },{passive:false});
    }

    function installPanel(){
        panel=primaryWrapper.append(false,WIDTH-304,38,296,466,function(s){
            fill(17,23,36,248);stroke(95,110,135);strokeWeight(1);s.fullRect();
            noStroke();fill(238,244,255);textStyle(BOLD);textAlign(LEFT,TOP);textSize(19);
            text('Temperature Editor',14,14);
            textStyle(NORMAL);textSize(12);fill(180,195,215);
            text(current()?(paused?'Simulation paused · edits start now':'Pause the simulation to edit'):'Historical view · editing locked',14,43);
            const bubbles=state().bubbles,b=selected();
            textSize(12);fill(238,244,255);
            text(b ? 'Bubble #'+b.id+' · '+bubbles.length+' total' : 'New bubble · '+bubbles.length+'/'+A.MAX_BUBBLES,14,154);
            fill(173,190,211);textSize(11);
            text('Warm / Cold: click ocean to place.',14,408);
            text('Select / Move: drag a bubble to move it.',14,424);
            textSize(10);fill(205,219,235);
            text(status.slice(0,47),14,446);
        },true,false);
        button(panel,260,8,25,'×',close);
        createSlider(panel,14,64,268,43,{label:'Global SST adjustment',min:A.GLOBAL_MIN,max:A.GLOBAL_MAX,step:0.1,unit:'°C',
            get:()=>state().globalOffset,enabled:editable,
            set:value=>{if(A.setGlobal(basin(),value))changed('Global adjustment applied.');}});
        for(const [index,name,label] of [[0,'warm','Warm'],[1,'cold','Cold'],[2,'select','Select / Move']]){
            button(panel,14+index*91,116,86,label,()=>{
                mode=name;
                if(name!=='select'){
                    selectedId=null;
                    brush.anomaly=(name==='cold'?-1:1)*(Math.abs(brush.anomaly)||3);
                }
                status=name==='select'?'Click inside a bubble, then drag.':'Click an ocean location to place a bubble.';
            },editable,()=>mode===name);
        }
        button(panel,218,147,64,'Next',()=>{
            const bubbles=state().bubbles;
            const index=bubbles.findIndex(b=>b.id===selectedId);
            selectedId=bubbles[(index+1)%bubbles.length].id;mode='select';
        },()=>!!state().bubbles.length);
        createSlider(panel,14,182,268,43,{label:'Bubble anomaly',min:A.BUBBLE_MIN,max:A.BUBBLE_MAX,step:0.1,unit:'°C',
            get:()=>selected()?selected().anomaly:brush.anomaly,enabled:editable,
            set:value=>{
                brush.anomaly=value;
                if(mode!=='select') mode=value<0?'cold':'warm';
                if(selected() && A.updateBubble(basin(),selectedId,{anomaly:value}))changed('Bubble temperature updated.');
            }});
        createSlider(panel,14,238,268,43,{label:'Bubble radius',min:A.RADIUS_MIN,max:A.RADIUS_MAX,step:25,unit:'km',
            get:()=>selected()?selected().radiusKm:brush.radiusKm,enabled:editable,
            set:value=>{
                brush.radiusKm=value;
                if(selected() && A.updateBubble(basin(),selectedId,{radiusKm:value}))changed('Bubble radius updated.');
            }});
        button(panel,14,294,268,()=>('Bubble outlines: '+(visible()?'Shown':'Hidden')),toggleVisible);
        button(panel,14,333,130,'Delete bubble',()=>{
            if(A.removeBubble(basin(),selectedId)){selectedId=null;changed('Bubble deleted. Undo is available.');}
        },()=>editable() && !!selected());
        button(panel,152,333,130,'Undo',()=>{
            if(A.undo(basin())){selectedId=null;changed('Last temperature edit undone.');}
        },()=>editable() && A.canUndo(basin()));
        for(const [x,label,field] of [[14,'SST map','SST'],[152,'Anomaly map','SSTAnomaly']])
            button(panel,x,370,130,label,()=>{
                basin().env.displaying=basin().env.fieldList.indexOf(field);redraw();
            });
        button(sideMenu,5,240,sideMenu.width-10,'Temperature Editor',open);
        button(sideMenu,5,270,sideMenu.width-10,()=>('Bubble outlines: '+(visible()?'Shown':'Hidden')),toggleVisible);
        const previousRender=primaryWrapper.renderFunc;
        primaryWrapper.renderFunc=function(s){previousRender.call(this,s);renderOverlay();};
        bindTouch();
    }

    const previousInit=UI.init;
    UI.init=function(){sliders=[];previousInit.call(UI);installPanel();};
    const previousMount=Basin.prototype.mount;
    Basin.prototype.mount=function(){close();return previousMount.call(this);};

    const previousPressed=window.mousePressed;
    const previousDragged=window.mouseDragged;
    const previousReleased=window.mouseReleased;
    const previousClicked=window.mouseClicked;
    window.mousePressed=function(event){
        suppressClick=false;
        if(event && event.button!==undefined && event.button!==0)
            return previousPressed && previousPressed.call(this,event);
        if(!waitingFor){
            UI.updateMouseOver();
            const slider=sliders.find(el=>isShowing(el) && UI.mouseOver===el);
            if(slider){
                const d=slider.temperatureSlider;
                suppressClick=true;
                if(!d.enabled || d.enabled()) drag={slider,value:sliderValue(slider)};
                return false;
            }
            if(panelOpen() && mapPoint()){
                suppressClick=true;
                if(!editable()){status='Return to the present and pause to edit.';return false;}
                const coord=oceanPoint();
                if(!coord){status='Choose an ocean location.';return false;}
                if(mode==='select'){
                    const bubble=pickBubble(coord);
                    selectedId=bubble?bubble.id:null;
                    if(bubble){
                        const centre=project(basin().mapType,bubble);
                        preview={type:'move',id:bubble.id,bubble:{...bubble},
                            dx:centre.x-getMouseX(),dy:centre.y-getMouseY()};
                    }
                }else{
                    if(state().bubbles.length>=A.MAX_BUBBLES){status='Maximum '+A.MAX_BUBBLES+' bubbles reached.';return false;}
                    selectedId=null;
                    preview={type:'new',bubble:{id:-1,...coord,anomaly:brush.anomaly,radiusKm:brush.radiusKm}};
                }
                return false;
            }
        }
        if(previousPressed instanceof Function) return previousPressed.call(this,event);
    };
    window.mouseDragged=function(event){
        if(drag){drag.value=sliderValue(drag.slider);return false;}
        if(preview){
            UI.updateMouseOver();
            if(mapPoint()){
                const coord=Coordinate.convertFromXY(basin().mapType,
                    getMouseX()+(preview.dx||0),getMouseY()+(preview.dy||0));
                preview.bubble={...preview.bubble,longitude:coord.longitude,latitude:coord.latitude};
            }
            return false;
        }
        if(previousDragged instanceof Function) return previousDragged.call(this,event);
    };
    window.mouseReleased=function(event){
        if(drag){
            const held=drag;drag=undefined;
            const d=held.slider.temperatureSlider;
            if(isShowing(held.slider) && (!d.enabled || d.enabled())) d.set(held.value);
            return false;
        }
        if(preview){
            const pending=preview;preview=undefined;
            UI.updateMouseOver();
            const coord=new Coordinate(pending.bubble.longitude,pending.bubble.latitude);
            if(editable() && mapPoint() && !land.get(coord)){
                if(pending.type==='new'){
                    selectedId=A.addBubble(basin(),pending.bubble,pending.bubble.anomaly,pending.bubble.radiusKm);
                    changed('Bubble placed. Select / Move to reposition.');
                }else if(A.updateBubble(basin(),pending.id,pending.bubble))changed('Bubble moved.');
            }else status='Move cancelled; choose an ocean location.';
            return false;
        }
        if(previousReleased instanceof Function) return previousReleased.call(this,event);
    };
    window.mouseClicked=function(event){
        if(suppressClick){suppressClick=false;return false;}
        if(previousClicked instanceof Function) return previousClicked.call(this,event);
    };

    return {createSlider,open,close,toggleVisible,renderOverlay,project,destination,
        get panel(){return panel;},get selectedId(){return selectedId;}};
})();
window.__raptorTemperatureEditor=TemperatureEditor;
