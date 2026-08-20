// Raptor Mod build marker + in-game changelog.
// Keep this build string and changelog updated with future mod releases so the
// main menu immediately shows whether GitHub Pages served the newest version.
(function(){
    const RAPTOR_MOD_BUILD = '0.7.1';
    const RAPTOR_MOD_DATE = '21 Aug 2026';

    const CHANGELOG = [
        {
            build: '0.7.1',
            date: '21 Aug 2026',
            changes: [
                'Fixed season-overview labels spilling outside the panel because a timeline constant accidentally shadowed p5 LEFT alignment.',
                'Restored compact multi-storm-per-row season timelines with smarter non-overlap packing.',
                'Kept intensity-colored lifecycle bars, hover/click storm selection, full-season month grid, and overflow scrolling.'
            ]
        },
        {
            build: '0.7.0',
            date: '21 Aug 2026',
            changes: [
                'Redesigned the existing season overview into cleaner grouped activity, totals, impacts, and most-intense-storm cards.',
                'Rebuilt the season timeline as dedicated storm rows across a full 12-month season grid.',
                'Timeline bars now change color through each storm lifecycle as its intensity classification changes.',
                'Added storm-row hover highlighting, click-through to the existing storm intensity graph, and vertical mouse-wheel scrolling for active seasons.',
                'Kept the existing storm intensity graph and all simulation physics unchanged.'
            ]
        },
        {
            build: '0.6.0',
            date: '21 Aug 2026',
            changes: [
                'Added Normal-mode Western Pacific seasonal vertical-wind-shear climatology tuning.',
                'Broadened the lower-shear tropical development belt through summer and early autumn.',
                'Kept winter generally more hostile while preserving lower-shear escape routes in the deep tropics.',
                'Preserved LL/UL steering direction and procedural shear variability so storm tracks are not artificially rewritten.',
                'Made the changelog a fixed-size mouse-wheel-scrollable panel instead of shrinking text as entries accumulate.'
            ]
        },
        {
            build: '0.5.0',
            date: '21 Aug 2026',
            changes: [
                'Improved warm-core L / tropical-remnant regeneration over favorable warm water.',
                'Added a gentler organization^2 recovery path for remnants without changing active-TC intensification.',
                'Added an 18-hour timeout for 1020+ hPa, sub-20 kt, nearly unorganized lows.',
                'Weak-low timeout resets when a remnant reaches genuinely favorable recovery conditions.'
            ]
        },
        {
            build: '0.4.0',
            date: '20 Aug 2026',
            changes: [
                'Added visible Raptor Mod build number to the main menu.',
                'Added this in-game changelog screen for easy update checking.'
            ]
        },
        {
            build: '0.3.0',
            date: '20 Aug 2026',
            changes: [
                'Retuned Normal-mode Western Pacific sea surface temperatures.',
                'Reduced WPac SST anomaly amplitude by 30%.',
                'Added a warmer tropical pool and summer/fall Kuroshio warm tongue.'
            ]
        },
        {
            build: '0.2.0',
            date: '20 Aug 2026',
            changes: [
                'Added responsive 16:9 browser scaling and reliable canvas centering.',
                'Added stylesheet cache-busting to make Pages updates easier to verify.'
            ]
        },
        {
            build: '0.1.0',
            date: '20 Aug 2026',
            changes: [
                'Added Natural Storm Spawning toggle below God Mode.',
                'Manual God Mode storm spawning remains available when natural spawning is disabled.'
            ]
        }
    ];

    // Expose build metadata for quick debugging from the browser console too.
    window.RAPTOR_MOD_BUILD = RAPTOR_MOD_BUILD;
    window.RAPTOR_MOD_CHANGELOG = CHANGELOG;

    const originalUIInit = UI.init;
    UI.init = function(){
        originalUIInit.call(UI);

        const changelogMenu = new UI(null,0,0,WIDTH,HEIGHT,undefined,undefined,false);
        const viewportHeight = 330;
        let scrollOffset = 0;
        let contentHeight = viewportHeight;

        // Always-visible build marker on the main menu.
        mainMenu.append(false,WIDTH/2,HEIGHT/4+76,0,0,function(){
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,CENTER);
            textStyle(NORMAL);
            textSize(14);
            text('Raptor Mod build ' + RAPTOR_MOD_BUILD + '  |  Base v' + VERSION_NUMBER,0,0);
        });

        // Locate the existing New Basin -> Load Basin -> Settings button chain.
        const newBasinButton = mainMenu.children.find(u=>
            u.width === 200 && u.height === 40 && u.relX === WIDTH/2-100
        );
        const loadButton = newBasinButton && newBasinButton.children.find(u=>
            u.width === 200 && u.height === 40 && u.relY === 60
        );
        const settingsButton = loadButton && loadButton.children.find(u=>
            u.width === 200 && u.height === 40 && u.relY === 60
        );

        if(settingsButton){
            settingsButton.append(false,0,60,200,40,function(s){
                s.button('Changelog',true,24);
            },function(){
                scrollOffset = 0;
                mainMenu.hide();
                changelogMenu.show();
            });
        }else{
            console.warn('Raptor Mod changelog: could not locate Settings button');
        }

        changelogMenu.append(false,WIDTH/2,48,0,0,function(){
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,CENTER);
            textStyle(NORMAL);
            textSize(34);
            text('Raptor Mod Changelog',0,0);
            textSize(15);
            text('Current build: ' + RAPTOR_MOD_BUILD + '  |  ' + RAPTOR_MOD_DATE + '  |  Base v' + VERSION_NUMBER,0,34);
            textSize(12);
            text('Mouse wheel to scroll',0,56);
        });

        changelogMenu.append(false,90,120,WIDTH-180,viewportHeight,function(){
            const ctx = drawingContext;

            fill(COLORS.UI.box);
            noStroke();
            rect(0,0,this.width,this.height);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0,0,this.width,this.height);
            ctx.clip();

            fill(COLORS.UI.text);
            noStroke();
            textAlign(LEFT,TOP);
            textStyle(NORMAL);

            const leftPad = 14;
            const rightPad = 26;
            const usableWidth = this.width-leftPad-rightPad;
            let y = 12-scrollOffset;

            const wrapLines = (str,maxWidth)=>{
                const words = str.split(' ');
                const lines = [];
                let line = '';
                for(const word of words){
                    const test = line ? line + ' ' + word : word;
                    if(line && textWidth(test)>maxWidth){
                        lines.push(line);
                        line = word;
                    }else{
                        line = test;
                    }
                }
                if(line) lines.push(line);
                return lines;
            };

            for(const release of CHANGELOG){
                textSize(18);
                textStyle(BOLD);
                text('Build ' + release.build + '  -  ' + release.date,leftPad,y);
                y += 25;

                textSize(14);
                textStyle(NORMAL);
                for(const change of release.changes){
                    const lines = wrapLines(change,usableWidth-18);
                    for(let i=0;i<lines.length;i++){
                        text((i===0 ? '• ' : '  ') + lines[i],leftPad+6,y);
                        y += 18;
                    }
                    y += 3;
                }
                y += 10;
            }

            contentHeight = y + scrollOffset + 12;
            ctx.restore();

            // Scrollbar.
            const maxScroll = Math.max(0,contentHeight-this.height);
            if(maxScroll>0){
                const trackX = this.width-10;
                const thumbHeight = Math.max(28,this.height*(this.height/contentHeight));
                const thumbTravel = this.height-thumbHeight;
                const thumbY = thumbTravel*(scrollOffset/maxScroll);

                noStroke();
                fill(COLORS.UI.buttonBox);
                rect(trackX,0,8,this.height);
                fill(COLORS.UI.text);
                rect(trackX,thumbY,8,thumbHeight);
            }
        });

        changelogMenu.append(false,WIDTH/2-100,HEIGHT-54,200,36,function(s){
            s.button('Back',true,22);
        },function(){
            changelogMenu.hide();
            mainMenu.show();
        });

        // Mouse-wheel scrolling while the changelog is open. Remove a previous
        // handler if UI.init is ever rebuilt, so listeners do not stack up.
        if(window.__raptorChangelogWheelHandler)
            window.removeEventListener('wheel',window.__raptorChangelogWheelHandler);

        window.__raptorChangelogWheelHandler = function(e){
            if(!changelogMenu.showing) return;
            const maxScroll = Math.max(0,contentHeight-viewportHeight);
            if(maxScroll<=0) return;

            scrollOffset += Math.sign(e.deltaY)*48;
            scrollOffset = Math.max(0,Math.min(maxScroll,scrollOffset));
            e.preventDefault();
        };
        window.addEventListener('wheel',window.__raptorChangelogWheelHandler,{passive:false});
    };
})();