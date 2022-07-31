const { default: rustpotterInit, RustpotterJSBuilder } = require('rustpotter-web');
const Recorder = require("opus-recorder");
(async () => {
    const recorderWorkerURL = new URL('../node_modules/opus-recorder/dist/waveWorker.min.js', import.meta.url);
    const USER_NAME = "rustpotter@Builder";
    let state = {
        recorder: null,
        records: [],
        wakewordName: '',
    };
    window.addEventListener('load', onWindowsLoad, { once: true });
    try {
        await checkRecordCapabilities();
        state.recorder = new Recorder({
            monitorGain: 0,
            recordingGain: 0.5,
            numberOfChannels: 1,
            wavBitDepth: 16,
            encoderPath: recorderWorkerURL.toString(),
        });
        state.recorder.onstreamerror = function (e) {
            printError('Error encountered: ' + e.message);
        };
        state.recorder.ondataavailable = function (typedArray) {
            const dataBlob = new Blob([typedArray], { type: 'audio/wav' });
            const fileName = new Date().toISOString() + ".wav";
            onNewRecord(dataBlob, fileName).catch(onError);
        };
        document.querySelector("#wakeword_name").addEventListener('input', onWakewordNameChange);
        document.querySelector("#record").addEventListener('click', onRecordStart);
        document.querySelector("#stop").addEventListener('click', onRecordStop);
        document.querySelector("#build").addEventListener('click', onBuildModel);
        const hiddenUploadInput = document.querySelector("#hidden_upload");
        hiddenUploadInput.addEventListener('change', onRecordUpload);
        document.querySelector("#upload").addEventListener('click', () => hiddenUploadInput.click());
        enableElement("record");
        enableElement("upload");
    } catch (error) {
        return printError(error.message ?? error);
    }
    // event listeners
    function onRecordStart(ev) {
        printLog("loading recorder...");
        state.recorder.start()
            .then(() => {
                printLog("recording...");
            }).catch(function (e) {
                onError(e);
                enableElement("record");
                enableElement("upload");
                enableElement("stop", false);
            });
        enableElement("record", false);
        enableElement("upload", false);
        enableElement("stop");
    }
    function onRecordStop(ev) {
        enableElement("stop", false);
        state.recorder.stop();
        printLog("record finished");
    }
    function onWakewordNameChange(ev) {
        state.wakewordName = ev.target.value;
        onRecordInfoChange();
    }
    function onRecordInfoChange() {
        const allowMoreRecords = state.records.length < 6;
        enableElement("record", allowMoreRecords);
        enableElement("upload", allowMoreRecords);
        enableElement("build", state.wakewordName.length > 0 && state.records.length > 0);
    }
    async function onNewRecord(dataBlob, fileName) {
        const url = URL.createObjectURL(dataBlob);
        const recordData = { name: fileName, data: await dataBlob.arrayBuffer() };
        state.records.push(recordData);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = url;
        const listElement = document.createElement('li');
        const downloadIcon = document.createElement('a');
        downloadIcon.href = url;
        downloadIcon.download = fileName;
        downloadIcon.innerHTML = '<img class="img_icon" src="download-icon.svg" alt="download" />';
        const removeIcon = document.createElement('i');
        removeIcon.innerHTML = '<img class="img_icon" src="remove-icon.svg" alt="remove" />';
        removeIcon.onclick = () => {
            state.records.splice(state.records.indexOf(recordData), 1);
            listElement.remove();
            URL.revokeObjectURL(url);
            onRecordInfoChange();
        };
        listElement.appendChild(audio);
        listElement.appendChild(downloadIcon);
        listElement.appendChild(removeIcon);
        document.querySelector("#records").appendChild(listElement);
        onRecordInfoChange();
    }
    function onRecordUpload(evt) {
        Array.from(evt.target.files).slice(0, 6 - state.records.length).forEach(file => {
            const reader = new FileReader();
            reader.onload = function () {
                const bytes = this.result;
                const dataBlob = new Blob([bytes], { type: 'audio/x-wav' });
                const fileName = file.name;
                onNewRecord(dataBlob, fileName).catch(onError);
            };
            reader.onerror = function () {
                printError("Unable to read wakeword file.");
                enableButtons(false);
            };
            reader.readAsArrayBuffer(file);
        });
    }
    async function onBuildModel() {
        printLog("loading rustpotter...");
        const wasmModuleUrl = new URL('../node_modules/rustpotter-web/rustpotter_wasm_bg.wasm', import.meta.url);
        try {
            await rustpotterInit(wasmModuleUrl);
            const rustpotter = RustpotterJSBuilder.new().build();
            const paramList = state.records.reduce((t, record) => {
                t.push(record.name, new Uint8Array(record.data));
                return t;
            }, []);
            const wakewordName = state.wakewordName;
            printLog("generating wakeword model...");
            rustpotter.addWakewordModelSamples(wakewordName, ...paramList);
            const modelBytes = rustpotter.generateWakewordModelBytes(wakewordName);
            printLog("unloading rustpotter...");
            rustpotter.free();
            const fileName = wakewordName.replaceAll(' ', '_') + '.rpw';
            printLog("downloading wakeword model '" + fileName + "'...");
            const blob = new Blob([modelBytes.buffer], {
                type: 'application/octet-stream'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.style = 'display: none';
            a.click();
            a.remove();
            printLog("done");
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            onError(error);
        }
    }
    function onWindowsLoad() {
        const versionLink = document.querySelector("#rustpotter_version");
        versionLink.innerHTML = "rustpotter-v" + VERSION;
        versionLink.href = "https://github.com/GiviMAD/rustpotter-cli/releases/tag/v" + VERSION;
        printLog("this is a demo web site for creating rustpotter models using wav samples");
    }
    // utils
    async function checkRecordCapabilities() {
        if (!Recorder.isRecordingSupported()) {
            const errorMessage = "Unable to record in this browser :(";
            alert(errorMessage);
            throw new Error(errorMessage);
        }
    }
    function enableElement(id, enabled = true) {
        document.querySelector("#" + id).disabled = !enabled;
    }
    function printLog(str) {
        console.log(str);
        const el = document.querySelector("#terminal");
        el.innerHTML += '<span style="color: grey">' + USER_NAME + '</span> % <span class="ok">' + str + '</span><br>';
        el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
    function printError(str) {
        console.error(str);
        const el = document.querySelector("#terminal");
        el.innerHTML += '<span style="color: grey">' + USER_NAME + '</span> % <span class="error">' + str + '</span><br>';
        el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
    function onError(error) {
        printError(error.message ? "unexpected error:" + error.message : error);
    }
})();
