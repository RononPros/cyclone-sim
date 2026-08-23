// Raptor Mod 0.16.0 hotfix v2: keep Storm Debug section headings left-aligned.
// Install the text() wrapper during UI.init(), after p5 global-mode drawing
// functions definitely exist. The v1 script ran too early on some loads.
(function(){
    const DEBUG_SECTION_TITLES = new Set([
        'CORE / INTENSITY',
        'PACING / RECENT CHANGE',
        'ENVIRONMENT',
        'RI / RECOVERY',
        'STEERING / INTERACTION',
        'POSITION / LIFECYCLE',
        'HISTORY / IMPACT',
        'CURRENT INTERNAL STATE'
    ]);

    const previousUIInit = UI.init;
    UI.init = function(){
        previousUIInit.call(UI);

        const previousText = window.text;
        if(!(previousText instanceof Function)){
            console.warn('Raptor storm-debug title alignment hotfix v2: p5 text() not found after UI.init');
            return;
        }
        if(previousText.__raptorDebugTitleAlignWrapped) return;

        const wrappedText = function(value){
            const isDebugSection = DEBUG_SECTION_TITLES.has(value) &&
                simSettings && simSettings.stormDebugMode &&
                selectedStorm instanceof Storm &&
                selectedStorm.current instanceof ActiveSystem &&
                UI.viewBasin instanceof Basin && UI.viewBasin.viewingPresent();

            if(!isDebugSection)
                return previousText.apply(this,arguments);

            push();
            textAlign(LEFT,TOP);
            const result = previousText.apply(this,arguments);
            pop();
            return result;
        };
        wrappedText.__raptorDebugTitleAlignWrapped = true;
        window.text = wrappedText;
    };

    window.__raptorStormDebugTitleAlignFix = {
        build: '0.16.0',
        revision: 2,
        installTiming: 'UI.init',
        forcedSectionAlignment: 'LEFT/TOP'
    };
})();
