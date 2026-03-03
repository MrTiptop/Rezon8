"use strict";
let config = {
    baseUrl: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host,
    followMeApi: {
        statusUrl: null,
        toggleUrl: null,
        method: "POST"
    }
};
//# sourceMappingURL=config.js.map