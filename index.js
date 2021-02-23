//
// Honeybadger React Native
//


import { Platform, NativeModules, NativeEventEmitter } from 'react-native';


const pkg = require('./package.json');
const HoneybadgerNativeModule = NativeModules.HoneybadgerReactNative;


let _apiKey = null;
let _initialized = false;
let _context = {};



// ----------------------------------------------------------------------------
// Public Interface
// ----------------------------------------------------------------------------

const honeybadger = {

    configure ( apiKey )
    {
        if ( _initialized ) {
            return;
        }

        if ( !isValidAPIKey(apiKey) ) {
            informUserOfInvalidAPIKey();
            return;
        }

        _apiKey = apiKey.trim();

        setNativeExceptionHandler();
        
        setJavaScriptErrorHandler();

        _initialized = true;
    },


    notify ( err, additionalData )
    {
        if ( !isValidAPIKey(_apiKey) ) {
            informUserOfInvalidAPIKey();
            return;
        }

        if ( !err || (isString(err) && err.trim().length === 0) || (isObject(err) && err.length === 0) ) {
            console.error('Honeybadger.notify() - invalid error');
            return;
        }

        if ( isString(err) ) {
            err = {
                'message' : err.trim(),
            };
        }

        if ( isStringWithValue(additionalData) ) {
            additionalData = {
                'additionalData' : additionalData.trim(),
            };
        }
        else if ( !isObject(additionalData) ) {
            additionalData = {};
        }

        const errName = safeStringFromField(err, 'name', 'Error via notify()');
        const errMsg = safeStringFromField(err, 'message', 'Unknown error message');

        let contextForThisError = {};
        Object.assign(contextForThisError, _context);
        Object.assign(contextForThisError, additionalData);

        let payloadData = {
            errorClass : `React Native ${(Platform.OS === 'ios' ? 'iOS' : 'Android')} ${errName}`,
            errorMsg : errMsg,
            details: {
                initialHandler: 'notify',
            },
            context: contextForThisError,
        };

        let backTrace = backTraceFromJavaScriptError(err);

        if ( arrayHasValues(backTrace.framesFromComponentStack) ) {
            payloadData.backTrace = backTrace.framesFromComponentStack;
            payloadData.details.primaryBackTraceSource = 'ReactNativeComponentStack';
            if ( arrayHasValues(backTrace.framesFromJavaScriptErrorStack) ) {
                payloadData.details.javaScriptStackTrace = backTrace.framesFromJavaScriptErrorStack;
            }
        } else if ( arrayHasValues(backTrace.framesFromJavaScriptErrorStack) ) {
            payloadData.backTrace = backTrace.framesFromJavaScriptErrorStack;
            payloadData.details.primaryBackTraceSource = 'JavaScriptErrorStack';
        }

        sendToHoneybadger(buildPayload(payloadData));
    },


    setContext ( context )
    {
        if ( isObject(context) ) {
            Object.assign(_context, context);
        }
    },


    resetContext ( context )
    {
        _context = (isObject(context) ? context : {});
    },
};


export default honeybadger;



// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

function informUserOfInvalidAPIKey() {
    console.error('Please initialize Honeybadger by calling configure() with a valid Honeybadger.io API key.');
}



function isValidAPIKey(apiKey) {
    return apiKey && apiKey.trim().length > 0;
}



function setJavaScriptErrorHandler() {
    console.log("Setting up the JavaScript global error handler.");
    global.ErrorUtils.setGlobalHandler(function(err, isFatal) {
        console.log("JavaScript global error handler triggered.");
        onJavaScriptError(err, {
            initialHandler: 'Global JavaScript Error Handler',
        });
    });
}



function setNativeExceptionHandler() {
    if ( !HoneybadgerNativeModule ) {
        console.error('honeybadger-react-native: The native module was not found. Please review the installation instructions.');
        return;
    }

    // console.log("Starting HoneyBadger native module.");
    HoneybadgerNativeModule.start();

    const nativeEventEmitter = new NativeEventEmitter(HoneybadgerNativeModule);
    
    console.log("Listening for native exceptions...");
    nativeEventEmitter.addListener('native-exception-event', function(data) {
        switch ( Platform.OS ) {
            case 'ios': onNativeIOSException(data); break;
            case 'android': onNativeAndroidException(data); break;
        }
    });
}



function sendToHoneybadger(payload) {
    if ( !payload || !isValidAPIKey(_apiKey) ) {
        return;
    }

    const params = {
        method: 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Accept' : 'text/json, application/json',
            'X-API-Key' : _apiKey,
            'User-Agent' : buildUserAgent(),
        },
        body: JSON.stringify(payload)
    };

    fetch('https://api.honeybadger.io/v1/notices/js', params).then(response => {
        if ( !response.ok ) {
            console.log(`Failed to post error to Honeybadger: ${response.status}`);
            console.log(response);
        } else {
            // console.log(response);
        }
    });
}



function buildUserAgent() {
    let reactNativeVersion = `${Platform.constants.reactNativeVersion.major}.${Platform.constants.reactNativeVersion.minor}.${Platform.constants.reactNativeVersion.patch}`;
    const nativePlatformName = Platform.constants.systemName || (Platform.OS === 'ios' ? 'iOS' : 'Android');
    const nativePlatformVersion = Platform.constants.osVersion || '';
    let nativePlatform = `${nativePlatformName} ${nativePlatformVersion}`;
    return `${pkg.name} ${pkg.version}; ${reactNativeVersion}; ${nativePlatform}`;
}



function buildPayload ( data ) {
    let payload = {
        notifier : {
            name : pkg.name,
            url : pkg.repository.url,
            version : pkg.version,
        },
        error : {
            class : data.errorClass || 'React Native Error',
            message : data.errorMsg || 'Unknown Error',
            backtrace : data.backTrace,
        },
        request : {
            context: data.context,
        },
        server : {
            environment_name: (__DEV__ ? "development" : "production"),
        },
    };

    if ( data.details && data.details.length > 0 ) {
        payload.details = {
            'React Native' : data.details
        }
    }

    return payload;
}



function framesFromComponentStack(str) {
    str = str || '';
    let frames = [];
    const regex = /^\s*in\s(?<methodName>\S+)(\s\(at\s(?<file>\S+):(?<lineNumber>\S+)\)\s*$)?/gm;
    let match;
    while ( (match = regex.exec(str)) !== null ) {
        if ( match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        frames.push({
            method: match.groups.methodName || '',
            file: match.groups.file || '',
            number: match.groups.lineNumber || '',
        });
    }
    return frames;
}



// ----------------------------------------------------------------------------
// JavaScript
// ----------------------------------------------------------------------------

function onJavaScriptError(err, data) {
    if ( !err ) {
        return;
    }

    let payloadData = {
        errorClass: `React Native ${(Platform.OS === 'ios' ? 'iOS' : 'Android')} Error`,
        errorMsg: errorMessageFromJavaScriptError(err),
        details: {
            initialHandler: data.initialHandler || '',
        },
        context: _context || {},
    };

    let backTrace = backTraceFromJavaScriptError(err);

    if ( arrayHasValues(backTrace.framesFromComponentStack) ) {
        payloadData.backTrace = backTrace.framesFromComponentStack;
        payloadData.details.primaryBackTraceSource = 'ReactNativeComponentStack';
        if ( arrayHasValues(backTrace.framesFromJavaScriptErrorStack) ) {
            payloadData.details.javaScriptStackTrace = backTrace.framesFromJavaScriptErrorStack;
        }
    } else if ( arrayHasValues(backTrace.framesFromJavaScriptErrorStack) ) {
        payloadData.backTrace = backTrace.framesFromJavaScriptErrorStack;
        payloadData.details.primaryBackTraceSource = 'JavaScriptErrorStack';
    }

    sendToHoneybadger(buildPayload(payloadData));
}



function errorMessageFromJavaScriptError(err) {
    if ( !err ) {
        return '';
    }

    if ( isStringWithValue(err) ) {
        return err.trim();
    }
    else if ( isObject(err) && err.message && err.message.length > 0 ) {
        return err.message;
    }

    return '';
}



function backTraceFromJavaScriptError(err) {
    return {
        framesFromComponentStack: ( isObjectWithField(err, 'componentStack') ? framesFromComponentStack(err.componentStack) : []),
        framesFromJavaScriptErrorStack: ( isObjectWithField(err, 'stack') ? framesFromJavaScriptErrorStack(err.stack) : []),
    };
}



function framesFromJavaScriptErrorStack(stack) {
    let frames = [];
    var lines = stack.split('\n');
    const javaScriptCoreRe = /^\s*(?:([^@]*)(?:\((.*?)\))?@)?(\S.*?):(\d+)(?::(\d+))?\s*$/i;
    for ( let i = 0 ; i < lines.length ; ++i ) {
        const line = lines[i];
        const parts = javaScriptCoreRe.exec(line);
        if ( parts ) {
            frames.push({
                file: parts[3] || '',
                method: parts[1] || '',
                number: (parts[4] ? +parts[4] : ''),
                column: (parts[5] ? +parts[5] : ''),
            });
        } else if ( line.indexOf('[native code]') !== -1 ) {
            let parts = line.split('@');
            if ( parts && parts.length === 2 ) {
                frames.push({
                    file: parts[1],
                    method: parts[0],
                    number: '',
                    column: '',
                });
            }
        }
    }
    return frames;
}



// ----------------------------------------------------------------------------
// Android
// ----------------------------------------------------------------------------

function onNativeAndroidException(data)
{
    let payloadData = {
        errorClass: `React Native Android ${data.type}`,
        errorMsg: data.message || '',
        context: _context || {},
    };

    let backTrace = backTraceFromAndroidException(data);

    if ( arrayHasValues(backTrace) ) {
        payloadData.backTrace = backTrace;
    }

    sendToHoneybadger(buildPayload(payloadData));
}



function backTraceFromAndroidException(data)
{
    if ( !data || !data.stackTrace ) return [];
    return data.stackTrace.map ( (frame) => {
        let method = ( isStringWithValue(frame.class) && isStringWithValue(frame.method) ) ? (frame.class + '.' + frame.method) : frame.method;
        return {
            method: method || '',
            file: frame.file || '',
            number: frame.line || ''
        };
    });
}



// ----------------------------------------------------------------------------
// iOS
// ----------------------------------------------------------------------------

function onNativeIOSException(data)
{
    let payloadData = {
        errorClass: `React Native iOS ${data.type}`,
        errorMsg: errorMessageFromIOSException(data),
        details: {
            errorDomain: data.errorDomain || '',
            initialHandler: data.initialHandler || '',
            userInfo: data.userInfo || {},
            architecture: data.architecture || '',
        },
        context: _context || {},
    };

    let backTrace = backTraceFromIOSException(data);

    if ( arrayHasValues(backTrace.framesFromComponentStack) )
    {
        payloadData.backTrace = backTrace.framesFromComponentStack;
        payloadData.details.primaryBackTraceSource = 'ReactNativeComponentStack';
        if ( arrayHasValues(backTrace.framesFromReactNativeIOSStackTrace) ) {
            payloadData.details.reactNativeIOSStackTrace = backTrace.framesFromReactNativeIOSStackTrace;
        }
        if ( arrayHasValues(backTrace.framesFromIOSCallStack) ) {
            payloadData.details.iosCallStack = backTrace.framesFromIOSCallStack;
        }
    }
    else if ( arrayHasValues(backTrace.framesFromReactNativeIOSStackTrace) )
    {
        payloadData.backTrace = backTrace.framesFromReactNativeIOSStackTrace;
        payloadData.details.primaryBackTraceSource = 'ReactNativeIOSStackTrace';
        if ( arrayHasValues(backTrace.framesFromIOSCallStack) ) {
            payloadData.details.iosCallStack = backTrace.framesFromIOSCallStack;
        }
    }
    else if ( arrayHasValues(backTrace.framesFromIOSCallStack) )
    {
        payloadData.backTrace = backTrace.framesFromIOSCallStack;
        payloadData.details.primaryBackTraceSource = 'iOSCallStack';
    }

    sendToHoneybadger(buildPayload(payloadData));
}



function errorMessageFromIOSException(data) {
    if ( !data ) {
        return '';
    }

    if ( data.localizedDescription && data.localizedDescription !== '' ) {
        const localizedDescription = data.localizedDescription;
        const startOfNativeIOSCallStack = localizedDescription.indexOf('callstack: (\n');
        if ( startOfNativeIOSCallStack === -1 ) {
            const lines = localizedDescription.split('\n');
            return lines.length === 0 ? localizedDescription : lines[0].trim();
        } else {
            return localizedDescription.substr(0, startOfNativeIOSCallStack).trim();
        }
    }
    else if ( (data.name && data.name !== '') || (data.reason && data.reason !== '') ) {
        return `${data.name} : ${data.reason}`.trim();
    }

    return '';
}



function backTraceFromIOSException(data) {
    return {
        framesFromComponentStack: framesFromComponentStack(data.localizedDescription),
        framesFromReactNativeIOSStackTrace: framesFromReactNativeIOSStackTrace(data),
        framesFromIOSCallStack: framesFromIOSCallStack(data),
    };
}



function framesFromReactNativeIOSStackTrace(data) {
    if ( !data.reactNativeStackTrace ) {
        return [];
    }
    let frames = [];
    data.reactNativeStackTrace.forEach( (frame) => {
        frames.push({
            method: frame.methodName || '',
            number: frame.lineNumber || '',
            file: frame.file || '',
            column: frame.column || '',
        });
    });
    return frames;
}



function framesFromIOSCallStack(data) {
    let callStack = [];

    if ( isStringWithValue(data.localizedDescription) ) {
        callStack = data.localizedDescription.split('\n').map(item => item.trim());
    }
    else if ( arrayHasValues(data.callStackSymbols) ) {
        callStack = data.callStackSymbols.map(item => item.trim());
    }

    let frames = [];
    const regex = /\d+\s+(?<moduleName>\S+)\s+(?<stackAddress>\S+)\s(?<loadAddress>.+)\s\+\s(?<symbolOffset>\d+)(\s+\((?<file>\S+):(?<line>\S+)\))?/gm;
    let match;
    callStack.forEach(element => {
        while ( (match = regex.exec(element)) !== null ) {
            if ( match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            
            let file = '';
            if ( match.groups.file ) file = match.groups.file;
            else if ( match.groups.moduleName ) file = match.groups.moduleName;

            frames.push({
                file: file,
                line: match.groups.line || '',
                method: match.groups.loadAddress || '',
                stack_address: match.groups.stackAddress || '',
            });
        }
    });

    return frames;
}



// ----------------------------------------------------------------------------
// Util
// ----------------------------------------------------------------------------

function isObject(val) {
    return val != null && (typeof val === 'object') && !(Array.isArray(val));
}

function isObjectWithField(possibleObj, field) {
    return isObject(possibleObj) && (field in possibleObj);
}

function isString(val) {
    return val != null && typeof val === 'string';
}

function isStringWithValue(val) {
    return isString(val) && val.trim().length > 0;
}

function arrayHasValues(obj) {
    return obj != null && Array.isArray(obj) && obj.length !== 0;
}

function safeStringFromField(obj, field, defaultValue = '') {
    if ( isObjectWithField(obj, field) && isStringWithValue(obj[field]) ) {
        return obj[field].trim();
    }
    return defaultValue;
}

