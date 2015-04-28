var isJSONG = require('./../support/isJSONG');
module.exports = function getProcessor(matchedResults) {
    return matchedResults.
        map(function(x) {
            return x.
                sort(function(a, b) {
                    if (a.precedence > b.precedence) {
                        return 1;
                    } else if (a.precedence < b.precedence) {
                        return -1;
                    }

                    // Should never happen.
                    return 0;
                });
        }).
        map(function(sortedMatches) {
            // TODO: precedence could happend here.
            var match = sortedMatches[0];
            var out = match.action(match.path);

            if (out.then) {
                out = Observable.fromPromise(out);
            }

            return out.
                map(function(incomingJSONGOrPathValues) {
                    if (isJSONG(incomingJSONGOrPathValues)) {
                        var jsong = incomingJSONGOrPathValues.jsong;
                        return {
                            jsong: jsong,
                            paths: [match.path]
                        };
                    }
                    return incomingJSONGOrPathValues;
                });
        });

};
