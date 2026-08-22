// Tiny UI hotfix: designation-system Prefix and Suffix inputs should not have
// a character limit. Intentionally unversioned and omitted from the changelog.
(function(){
    const originalAppend = UI.prototype.append;

    UI.prototype.append = function(chain,...opts){
        const renderer = opts[4];

        // In the stock designation editor these two inputs are created as
        // [18, 6, enterFunc]. Replace only their six-character limit while
        // leaving every other text input's validation unchanged.
        if(Array.isArray(renderer) && renderer[1] === 6 && this.renderFunc){
            const src = this.renderFunc.toString();
            if(src.includes("text('Prefix:'") || src.includes("text('Suffix:'"))){
                opts[4] = [renderer[0], undefined, renderer[2]];
            }
        }

        return originalAppend.call(this,chain,...opts);
    };
})();
