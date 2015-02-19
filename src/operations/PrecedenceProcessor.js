var Keys = require('../Keys');
var Precedence = require('../Precedence');
var Observable = require('falcor').Observable;
var PrecedenceProcessor = {
    execute: executeByPrecedence
};
module.exports = PrecedenceProcessor;

function executeByPrecedence(paths, matches) {

    // process until there are no more paths or no more matches.
    var matched;
    var newPerms;
    var matchedPaths;
    var i = 0;
    var generatedResults;
    var results = [];
    while (paths.length && matches.length) {
        matched = matches.shift();

        // Mutates the paths object.
        newPerms = [];
        matchedPaths = [];
        i = 0;
        do {
            // TODO: PERFORMANCE: doesn't need to be executed the first time.
            if (isMatch(paths[i], matched.valueRunner, matched.virtualRunner)) {
                generatedResults = generateFromMatched(paths[i], matched.virtualRunner, 0);
                newPerms = newPerms.concat(generatedResults.newPermutations);
                matchedPaths.push(generatedResults.matchedPath);
            }

            // if its not a match, then put it into the new perms.
            else {
                newPerms.push(paths[i]);
            }
        } while (++i < paths.length);

        paths.length = 0;
        paths = paths.concat(newPerms);

        // There will possibly have to be contexts
        matchedPaths.forEach(function(path) {
            try {
                results[results.length] = {
                    obs: matched.action(matchVirtualPathFormat(path, matched.virtualRunner)),
                    path: path
                };
            } catch (e) {
                results[results.length] = {
                    obs: Observable.throw({message: e, $type: 'error'}),
                    path: path
                };
            }
        });
    }

    return {
        misses: paths,
        results: results
    };
}

function isMatch(incoming, value, virtual) {
    for (var i = 0; i < virtual.length; i++) {
        if (!isMatchAtom(incoming[i], value[i], virtual[i])) {
            return false;
        }
    }
    return true;
}

function isStrictComparable(incomingAtom, virtualAtom) {
    return typeof incomingAtom !== 'object' && typeof virtualAtom !== 'object' &&
        virtualAtom !== Keys.integers && virtualAtom !== Keys.ranges;
}

function arrayComparable(incomingAtom, virtualAtom) {
    // is an array of keys
    if (typeof virtualAtom === 'object') {
        // TODO: PERFORMANCE: value map?
        for (var i = 0; i < incomingAtom.length; i++) {
            for (var j = 0; j < virtualAtom.length; j++) {
                if (incomingAtom[i] === virtualAtom[j]) {
                    return true;
                }
            }
        }
    }

    // match on integers or ranges.
    else if (virtualAtom === Keys.ranges || virtualAtom === Keys.integers) {
        return incomingAtom.some(function(x) { return typeof x === 'number'; });
    }

    // matches everything
    else if (virtualAtom === Keys.keys) {
        return true;
    }

    // Loop through incoming and compare against virtualAtom
    else {
        // TODO: PERFORMANCE: value map?
        for (var i = 0; i < incomingAtom.length; i++) {
            if (incomingAtom[i] === virtualAtom) {
                return true;
            }
        }
    }

    return false;
}

function objectComparable(incomingAtom, virtualAtom) {
    var from = incomingAtom.from || 0;
    var to = incomingAtom.to || (incomingAtom.length + incomingAtom.from) || 0;

    // is an array of keys
    if (typeof virtualAtom === 'object') {
        for (var i = 0; i < virtualAtom.length; i++) {
            if (virtualAtom[i] >= from && virtualAtom[i] <= to) {
                return true;
            }
        }
    }

    // match on integers or ranges.
    else if (virtualAtom === Keys.ranges || virtualAtom === Keys.integers) {
        return true;
    }

    // matches everything
    else if (virtualAtom === Keys.keys) {
        return true;
    }

    else {
        if (virtualAtom >= from && virtualAtom <= to) {
            return true;
        }
    }

    return false;
}

function isMatchAtom(incomingAtom, valueAtom, virtualAtom) {
    // Shortcut for keys
    if (virtualAtom === Keys.keys) {
        return true;
    }

    if (isStrictComparable(incomingAtom, valueAtom)) {
        return incomingAtom === valueAtom;
    } else if (Array.isArray(incomingAtom)) {
        return arrayComparable(incomingAtom, virtualAtom);
    }

    return objectComparable(incomingAtom, virtualAtom);
}

function generateFromMatched(incoming, virtual, matchedIdx) {
    // remove from array
    var virtualAtom, incomingAtom;
    var prefix = [];
    var newPermutations = [];
    var results;
    var prefixAtom;

    // push onto stack matched with each permutation point stripped out.
    for (var i = 0; i < virtual.length; i++) {
        virtualAtom = virtual[i];
        incomingAtom = incoming[i];
        prefixAtom = incomingAtom;

        // It is permutable.  Time to permute and produce a new array.
        if (typeof incomingAtom === 'object') {
            // [...] - x0
            results = permuateAt(prefix, virtualAtom, incomingAtom, incoming.slice(i + 1));
            if (results) {
                newPermutations = newPermutations.concat(results.newPermutations);
                prefixAtom = results.newPrefixAtom;
            }
        }
        prefix.push(prefixAtom);
    }

    return {
        newPermutations: newPermutations,
        matchedPath: flatten(prefix)
    };
}

function permuateAt(prefix, virtualAtom, incomingAtom, suffix) {
    // If its keys, we never permute.
    if (virtualAtom === Keys.keys) {
        return null;
    }

    var virtualAtomIsIntegers = virtualAtom === Keys.integers;
    var virtualAtomIsIntsOrRanges = virtualAtom === Keys.ranges;
    var virtualAtomIsMatcher = virtualAtomIsIntegers || virtualAtomIsIntsOrRanges;
    var newPermutations = [];
    var newPrefixAtom = incomingAtom;

    if (Array.isArray(incomingAtom)) {
        var stripped;
        newPrefixAtom = [];

        // incoming atom is all integers and were expecting integers.
        if ((virtualAtomIsIntegers || virtualAtomIsIntsOrRanges) && incomingAtom.every(function(x) { return typeof x === 'number'; })) {
            return null;
        }

        // is virtualAtom an array of keys
        else if (Array.isArray(virtualAtom)) {
            // n^2 match
            var larger, smaller;
            larger = virtualAtom.length >= incomingAtom.length ? virtualAtom : incomingAtom;
            smaller = virtualAtom.length >= incomingAtom.length ? incomingAtom : virtualAtom;
            stripped = [larger.reduce(function(acc, largerKey) {
                var matched = false;
                for (var i = 0; i < smaller.length; i++) {
                    matched = smaller[i] === largerKey;
                    if (matched) {
                        break;
                    }
                }

                if (matched) {
                    newPrefixAtom.push(largerKey);
                } else {
                    acc.push(largerKey);
                }
                return acc;
            }, [])];
        }

        // addressing virtualAtom as an integers matcher.
        else if (virtualAtomIsMatcher) {
            stripped = [incomingAtom.reduce(function(acc, x) {
                if (typeof x !== 'number') {
                    acc.push(x);
                } else {
                    newPrefixAtom.push(x);
                }

                return acc;
            }, [])];
        }

        // virtualAtom is a primitive, check against each element.
        else {

            stripped = [incomingAtom.reduce(function(acc, el) {
                if (el !== virtualAtom) {
                    acc.push(el);
                } else {
                    newPrefixAtom.push(el);
                }
                return acc;
            }, [])];
        }

        // Stripped is a 2d array because its concat'd (flattened)
        // into prefix.
        if (stripped[0].length) {
            newPermutations.push(prefix.
                concat(flatten(stripped)).
                concat(suffix));
        }
    }

    else if (typeof incomingAtom === 'object') {
        // short circuit on ints/ranges
        if (virtualAtomIsIntsOrRanges || virtualAtomIsIntegers) {
            return null;
        }

        var from = incomingAtom.from || 0;
        var to = incomingAtom.to || from + incomingAtom.length;

        if (virtualAtom === from) {
            if (from + 1 > to) {
                return null;
            }
            newPermutations.push(
                prefix.
                    concat({from: from + 1, to: to}).
                    concat(suffix));
        } else if (virtualAtom === to) {
            if (to - 1 < from) {
                return null;
            }
            newPermutations.push(
                prefix.
                    concat({from: from, to: to - 1}).
                    concat(suffix));
        } else {
            newPermutations.push(
                prefix.
                    concat({from: from, to: virtualAtom - 1}).
                    concat(suffix));
            newPermutations.push(
                prefix.
                    concat({from: virtualAtom + 1, to: to}).
                    concat(suffix));
        }
        newPrefixAtom = virtualAtom;
    }

    // incomingAtom is a primitive, virtualAtom is unknown.
    else {
        // short circuit on ints/ranges
        if (virtualAtomIsIntsOrRanges || virtualAtomIsIntegers) {
            return null;
        }

        // either virtualAtom is array or primitive
        // No permutation on strictComparable.
        if (isStrictComparable(incomingAtom, virtualAtom)) {
            return null;
        }

        // virtualAtom is an array.
        stripped = [virtualAtom.reduce(function(acc, el) {
            if (el !== incomingAtom) {
                acc.push(el);
            } else {
                newPrefixAtom.push(el);
            }

            return acc;
        }, [])];

        if (stripped.length) {
            newPermutations.push(prefix.
                concat(flatten(stripped)).
                concat(suffix));
        }
    }

    return {
        newPermutations: newPermutations,
        newPrefixAtom: newPrefixAtom
    };
}

function flatten(x) {
    return x.map(function(atom) {
        if (Array.isArray(atom) &&  atom.length === 1) {
            return atom[0];
        }
        return atom;
    });
}

// TODO: Performance, should be done during the generated matches?
function matchVirtualPathFormat(incomingValues, virtualExpected) {
    var output = [];
    var i = 0;
    virtualExpected.forEach(function(vK) {
        var val = incomingValues[i];
        if (vK === Keys.integers) {
            if (typeof val !== 'object') {
                output[i] = [val];
            } else if (!Array.isArray(val)) {
                output[i] = convertRangeToArray(val);
            } 
        } else if (vK === Keys.ranges) {
            if (typeof val !== 'object') {
                val = [val];
            }
            if (typeof val === 'object') {
                if (Array.isArray(val)) {
                    output[i] = convertArrayToRange(val);
                } else {
                    // the range is just a range, which means this was the matching range,
                    // which needs to be stripped of navigation keys.
                    if (typeof val.length === 'number') {
                        output[i] = [{length: val.length, from: val.from || 0}];
                    } else {
                        output[i] = [{from: val.from || 0, to: val.to}];
                    }
                }
            }
        } else if (vK === Keys.keys) {
            if (typeof val !== 'object') {
                output[i] = [val];
            } else if (!Array.isArray(val)) {
                output[i] = convertRangeToArray(val);
            }
        }
        if (output[i] === undefined) {
            output[i] = val;
        }
        i++;
    });

    return output;
}

function convertRangeToArray(range) {
    var from = range.from || 0;
    var to = typeof range.to === 'number' ? range.to : range.length;
    var convertedValue = [];
    for (var j = from; j <= to; j++) {
        convertedValue.push(j);
    }
    return convertedValue;
}

function convertArrayToRange(array) {
    var convertedRange = array.
        sort().
        reduce(function(acc, v) {
            if (!acc.length) {
                acc.push({from: v, to: v});
            } else {
                var currRange = acc[acc.length - 1];
                if (currRange.to + 1 < v) {
                    acc.push({from: v, to: v});
                } else {
                    currRange.to = v;
                }
            }

            return acc;
        }, []);

    if (convertedRange.length === 0) {
        return convertedRange[0];
    }
    return convertedRange;
}
