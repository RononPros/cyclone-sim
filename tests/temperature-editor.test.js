const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

function editor(canvas){
    const s=loadSimulation(),a=s.api;
    if(canvas) s.context.document.querySelector=()=>canvas;
    const b=a.makeBasin(8);b.tick=0;b.temperatureAdjustments=a.TemperatureAdjustments.create();
    b.env={displayLayer(){},fieldList:['SSTAnomaly','SST'],displaying:-1};
    s.context.testBasin=b;
    s.evaluate(`
        defineColors();UI.init();scaler=1;waitingFor=0;paused=true;
        mainMenu.hide();primaryWrapper.show();
        UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;
        refreshTracks=function(){};
        TemperatureEditor.open();
    `);
    const move=(x,y)=>{s.context.mouseX=x;s.context.mouseY=y;};
    const click=(x,y)=>{
        move(x,y);s.evaluate('mousePressed({button:0});mouseReleased({button:0});mouseClicked({button:0});');
    };
    return {s,a,b,move,click};
}

test('the canvas editor places warm/cold bubbles, moves them and supports delete/undo',()=>{
    const {s,a,b,move,click}=editor(),A=a.TemperatureAdjustments;
    click(400,300);click(800,167);click(560,375);
    assert.equal(A.stateAt(b).bubbles.length,2);
    assert.equal(A.stateAt(b).bubbles[0].anomaly,3);
    assert.equal(A.stateAt(b).bubbles[1].anomaly,-3);
    click(895,167);
    move(400,300);s.evaluate('mousePressed({button:0});');
    move(440,300);s.evaluate('mouseDragged({button:0});mouseReleased({button:0});mouseClicked({button:0});');
    const c=A.stateAt(b).bubbles[0];
    const p=a.Coordinate.convertToXY(8,c.longitude,c.latitude);
    assert.ok(Math.abs(p.x-440)<1e-9);
    click(735,384);assert.equal(A.stateAt(b).bubbles.length,1);
    click(873,384);assert.equal(A.stateAt(b).bubbles.length,2);
});

test('dragging a slider commits once, preserves zero, and undo restores the previous value',()=>{
    const {s,a,b,move,click}=editor(),A=a.TemperatureAdjustments;
    move(804,131);s.evaluate('mousePressed({button:0});');
    for(const x of [820,840,860]){move(x,131);s.evaluate('mouseDragged({button:0});');}
    assert.equal(A.stateAt(b).globalOffset,0,'preview must not mutate the simulation');
    s.evaluate('mouseReleased({button:0});mouseClicked({button:0});');
    assert.equal(A.stateAt(b).globalOffset,2.3);
    click(873,384);assert.equal(A.stateAt(b).globalOffset,0);
    assert.equal(A.canUndo(b),false,'one drag should create exactly one undo step');
});

test('reopening the editor keeps the chosen cold brush consistent with newly placed bubbles',()=>{
    const {a,b,click}=editor();
    click(800,167);
    a.TemperatureEditor.close();a.TemperatureEditor.open();
    click(400,300);
    assert.equal(a.TemperatureAdjustments.stateAt(b).bubbles[0].anomaly,-3);
});

test('touch gestures use the displayed canvas scale and support slider dragging without duplicate placement',()=>{
    const listeners={};
    const canvas={width:960,height:540,
        getBoundingClientRect:()=>({left:20,top:30,width:480,height:270}),
        addEventListener:(type,callback)=>{listeners[type]=callback;}};
    const {s,a,b,move}=editor(canvas),A=a.TemperatureAdjustments;
    const event=(x,y,ended=false)=>{
        const touch={clientX:20+x/2,clientY:30+y/2};
        return {touches:ended?[]:[touch],changedTouches:[touch],preventDefault(){this.prevented=true;}};
    };
    const start=event(400,300),end=event(400,300,true);
    listeners.touchstart(start);listeners.touchend(end);
    assert.equal(start.prevented,true);assert.equal(end.prevented,true);
    assert.equal(A.stateAt(b).bubbles.length,1);
    const c=A.stateAt(b).bubbles[0];
    const p=a.Coordinate.convertToXY(8,c.longitude,c.latitude);
    assert.ok(Math.abs(p.x-400)<1e-9 && Math.abs(p.y-300)<1e-9);
    listeners.touchstart(event(804,131));
    move(840,131);s.evaluate('mouseDragged({});');
    listeners.touchend(event(840,131,true));
    assert.equal(A.stateAt(b).globalOffset,1.5);
    assert.equal(A.stateAt(b).bubbles.length,1);
    listeners.touchstart(event(860,131));listeners.touchcancel(event(860,131,true));
    assert.equal(A.stateAt(b).globalOffset,1.5,'cancelled touch previews must not be committed');
});

test('the visibility toggle is independent and historical/running views reject edits',()=>{
    const {s,a,b,click}=editor(),A=a.TemperatureAdjustments;
    click(400,300);const before=JSON.stringify(A.stateAt(b));
    click(800,345);assert.equal(b.temperatureAdjustments.showBubbles,false);
    assert.equal(JSON.stringify(A.stateAt(b)),before);
    b.tick=12;s.evaluate('viewTick=6;');
    const saved=JSON.stringify(b.temperatureAdjustments);
    click(400,300);click(860,131);click(735,384);
    assert.equal(JSON.stringify(b.temperatureAdjustments),saved);
    s.evaluate('viewTick=12;paused=false;');
    click(400,300);click(860,131);
    assert.equal(JSON.stringify(b.temperatureAdjustments),saved);
});

test('placing or dropping bubbles on land is rejected without deleting the original',()=>{
    const {s,a,b,move,click}=editor(),A=a.TemperatureAdjustments;
    a.setLand(c=>c.longitude>145 ? 0.6 : 0);
    click(600,300);assert.equal(A.stateAt(b).bubbles.length,0);
    click(400,300);assert.equal(A.stateAt(b).bubbles.length,1);
    const before=JSON.stringify(A.stateAt(b));click(895,167);
    move(400,300);s.evaluate('mousePressed({button:0});');
    move(600,300);s.evaluate('mouseDragged({button:0});mouseReleased({button:0});mouseClicked({button:0});');
    assert.equal(JSON.stringify(A.stateAt(b)),before);
});

test('editor text and controls fit inside the map viewport and creation slider fits above Back',()=>{
    const {s,a}=editor();
    s.evaluate('drawCalls.length=0;');
    const panel=a.TemperatureEditor.panel;
    panel.renderFunc.call(panel,panel.schematics());
    for(const child of panel.children){
        assert.ok(child.relX>=0 && child.relY>=0);
        assert.ok(child.relX+child.width<=panel.width);
        assert.ok(child.relY+child.height<=panel.height);
    }
    assert.ok(panel.relY>=30 && panel.relY+panel.height<=510);
    for(const text of s.context.drawCalls){
        assert.ok(text.x>=0 && text.x<panel.width,text.value);
        assert.ok(text.y>=0 && text.y+text.size<panel.height,text.value);
    }
    assert.equal(s.evaluate(`
        const creationSlider=basinCreationMenuAdvanced.children.find(c=>c.temperatureSlider);
        creationSlider.getY()+creationSlider.height<7*HEIGHT/8-20;
    `),true);
});
