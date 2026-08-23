// Raptor Mod 0.16.0 hotfix: keep Storm Debug section headings left-aligned.
// The two-page renderer draws row values right-aligned, so later headings can
// otherwise inherit RIGHT alignment and drift into the middle of the panel.
(function(){
    const previousText = window.text;
    if(!(previousText instanceof Function)){
        console.warn('Raptor storm-debug title alignment hotfix: p5 text() not found');
        return;
    }

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

    window.text = function(value){
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

    window.__raptorStormDebugTitleAlignFix = {
        build: '0.16.0',
        forcedSectionAlignment: 'LEFT/TOP'
    };
})();
