// Raptor Mod 0.16.0 hotfix: make Storm Debug readable and invisible until useful.
// Keeps the Debug Update observational and does not change any storm physics.
(function(){
    const previousUIInit = UI.init;

    const walk = (node,pred)=>{
        if(pred(node)) return node;
        for(const child of node.children || []){
            const found = walk(child,pred);
            if(found) return found;
        }
    };

    UI.init = function(){
        previousUIInit.call(UI);

        const panel = walk(primaryWrapper,u=>
            u && u.renderFunc &&
            u.renderFunc.toString().includes('STORM DEBUG  |') &&
            u.renderFunc.toString().includes('Likely limiter')
        );

        if(!panel){
            console.warn('Raptor storm-debug UI hotfix: debug panel not found');
            return;
        }

        const originalRender = panel.renderFunc;
        panel.renderFunc = function(s){
            // Do not draw the giant debug rectangle or any placeholder text until
            // there is an actually selected, currently active storm to inspect.
            if(!simSettings || !simSettings.stormDebugMode) return;
            if(!(selectedStorm instanceof Storm)) return;
            if(!(selectedStorm.current instanceof ActiveSystem)) return;
            if(!(UI.viewBasin instanceof Basin) || !UI.viewBasin.viewingPresent()) return;

            // The simulator's UI text color can be black in light color schemes,
            // while the debug panel deliberately uses a dark translucent backing.
            // Temporarily force a high-contrast diagnostic palette only while this
            // panel renders, then immediately restore the user's theme colors.
            const oldText = COLORS.UI.text;
            const oldGreyText = COLORS.UI.greyText;
            try{
                COLORS.UI.text = color(245,245,245);
                COLORS.UI.greyText = color(180,190,205);
                originalRender.call(this,s);
            }finally{
                COLORS.UI.text = oldText;
                COLORS.UI.greyText = oldGreyText;
            }
        };
    };

    window.__raptorStormDebugUIFix = {
        build: '0.16.0',
        hideUntilActiveSelection: true,
        forceHighContrastPanelText: true
    };
})();
