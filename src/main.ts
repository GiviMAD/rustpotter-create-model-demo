import { WavRecorder } from "./recorder";
import rustpotterInit, { Wakeword } from 'rustpotter-web';
import { WaveFile } from "wavefile";
(async () => {
    const USER_NAME = "rustpotter@Builder";
    let stopRecordTimeoutRef = null as any;
    let state = {
        recordSupported: false,
        recorder: null as WavRecorder | null,
        records: [] as { name: string, data: ArrayBuffer }[],
        micGain: 1,
        stopSec: null as number | null,
        wakewordName: '',
    };
    window.addEventListener('load', onWindowsLoad, { once: true });
    try {
        state.recordSupported = isRecordingSupported();
        if (state.recordSupported) {
            state.recorder = new WavRecorder(new AudioContext());
        } else {
            printError("Unable to record on this browser :(");
        }
        document.querySelector("#wakeword_name")?.addEventListener('input', onWakewordNameChange);
        document.querySelector("#mic_gain")?.addEventListener('input', onMicGainInput);
        document.querySelector("#stop_sec")?.addEventListener('input', onStopSecInput);
        document.querySelector("#record")?.addEventListener('click', onRecordStart);
        document.querySelector("#stop")?.addEventListener('click', onRecordStop);
        document.querySelector("#build")?.addEventListener('click', onBuildModel);
        const hiddenUploadInput: HTMLElement | null = document.querySelector("#hidden_upload");
        hiddenUploadInput?.addEventListener('change', onRecordUpload);
        document.querySelector("#upload")?.addEventListener('click', () => hiddenUploadInput?.click());
        enableInputs();
    } catch (error) {
        return onError(error);
    }
    // event listeners
    function onMicGainInput(ev: Event) {
        state.micGain = Number((ev.target as HTMLInputElement).value);
    }
    function onStopSecInput(ev: Event) {
        const value = (ev.target as HTMLInputElement).value;
        const numberValue = Number((ev.target as HTMLInputElement).value?.trim());
        state.stopSec = value != null && value.length && !isNaN(numberValue) ? numberValue : null;
    }
    function onRecordStart(_: Event) {
        printLog("loading recorder...");
        state.recorder?.setGain(state.micGain);
        state.recorder?.start()
            .then(() => {
                printLog("recording...");
                if (state.stopSec) {
                    stopRecordTimeoutRef = setTimeout(onRecordStop, state.stopSec * 1000);
                }
                enableElement("stop");
            }).catch(function (e) {
                onError(e);
                enableInputs();
            });
        enableElement("mic_gain", false);
        enableElement("stop_sec", false);
        enableElement("build", false);
        enableElement("record", false);
        enableElement("upload", false);
    }
    function onRecordStop() {
        if (stopRecordTimeoutRef) {
            clearTimeout(stopRecordTimeoutRef);
            stopRecordTimeoutRef = null;
        }
        enableElement("stop", false);
        state.recorder?.end().then((wavFile) => {
            let fileName = new Date().toISOString() + ".wav";
            if (state.wakewordName.length) {
                const currDate = new Date();
                const hour = currDate.getHours().toString().padStart(2, "0") + '_' + currDate.getMinutes().toString().padStart(2, "0") + '_' + currDate.getSeconds().toString().padStart(2, "0");
                fileName = `${state.wakewordName.replaceAll(' ', '_')}(T${hour}).wav`;
            }
            onNewRecord(wavFile, fileName).catch(onError);
        }).catch((err) => {
            console.error("End record failed: ", err);
            enableInputs();
        });
        printLog("record finished");
    }
    function onWakewordNameChange(ev: Event) {
        state.wakewordName = (ev.target as HTMLInputElement).value?.trim();
        enableInputs();
    }
    function enableInputs() {
        const allowMoreRecords = state.records.length < 20;
        enableElement("mic_gain", true);
        enableElement("stop_sec", true);
        enableElement("record", !!state.wakewordName.length && state.recordSupported && allowMoreRecords);
        enableElement("upload", allowMoreRecords);
        enableElement("build", state.wakewordName.length > 0 && state.records.length > 0);
    }
    async function onNewRecord(wavFile: WaveFile, fileName: string) {
        const url = wavFile.toDataURI();
        const recordData = { name: fileName, data: wavFile.toBuffer() };
        state.records.push(recordData);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = url;
        const listElement = document.createElement('li');
        const downloadIcon = document.createElement('a');
        downloadIcon.href = url;
        downloadIcon.download = fileName;
        downloadIcon.innerHTML = `<img title="Download ${fileName}" class="img_icon" src="download-icon.svg" alt="download" />`;
        const removeIcon = document.createElement('i');
        removeIcon.innerHTML = `<img title="Remove ${fileName}" class="img_icon" src="remove-icon.svg" alt="remove" />`;
        removeIcon.onclick = () => {
            state.records.splice(state.records.indexOf(recordData), 1);
            listElement.remove();
            URL.revokeObjectURL(url);
            enableInputs();
        };
        listElement.appendChild(audio);
        listElement.appendChild(downloadIcon);
        listElement.appendChild(removeIcon);
        document.querySelector("#records")?.appendChild(listElement);
        enableInputs();
    }
    function onRecordUpload(evt: Event) {
        Array.from((evt.target as HTMLInputElement | null)?.files ?? []).slice(0, 6 - state.records.length).forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = function () {
                const bytes = this.result as ArrayBuffer;
                let wav = new WaveFile();
                wav.fromBuffer(new Uint8Array(bytes));
                const fileName = file.name;
                onNewRecord(wav, fileName).catch(onError);
            };
            reader.onerror = function () {
                printError("Unable to read wakeword file.");
            };
            reader.readAsArrayBuffer(file);
        });
    }
    async function onBuildModel() {
        printLog("loading rustpotter...");
        const wasmModuleUrl = new URL('../node_modules/rustpotter-web/rustpotter_wasm_bg.wasm', import.meta.url);
        try {
            await rustpotterInit(wasmModuleUrl);
            const wakeword = Wakeword.new(state.wakewordName);
            printLog("generating wakeword model...");
            state.records.forEach(({ name, data }) => wakeword.addFile(name, new Uint8Array(data)));
            const modelBytes = wakeword.saveToBytes();
            printLog("unloading rustpotter...");
            wakeword.free();
            const fileName = state.wakewordName.replaceAll(' ', '_') + '.rpw';
            printLog("downloading wakeword model '" + fileName + "'...");
            const blob = new Blob([modelBytes.buffer], {
                type: 'application/octet-stream'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.setAttribute('style', 'display: none');
            a.click();
            a.remove();
            printLog("done");
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
            onError(error);
        }
    }
    function onWindowsLoad() {
        const versionLink = document.querySelector<HTMLAnchorElement>("#rustpotter_version");
        if (versionLink) {
            versionLink.innerHTML = "rustpotter-v" + LIB_VERSION;
            versionLink.href = "https://github.com/GiviMAD/rustpotter-cli/releases/tag/v" + LIB_VERSION;
        }
        printLog("this is a demo web site for creating rustpotter models");
    }
    // utils
    function enableElement(id: string, enabled = true) {
        const el = document.querySelector<any>("#" + id);
        if (el) el.disabled = !enabled;
    }
    function printLog(str: string) {
        console.log(str);
        const el = document.querySelector("#terminal");
        if (!el) return;
        el.innerHTML += '<span style="color: grey">' + USER_NAME + '</span> % <span class="ok">' + str + '</span><br>';
        if (el.parentElement)
            el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
    function printError(str: string, log = true) {
        if (log) console.error(str);
        const el = document.querySelector<HTMLDivElement>("#terminal");
        if (!el) return;
        el.innerHTML += '<span style="color: grey">' + USER_NAME + '</span> % <span class="error">' + str + '</span><br>';
        if (el.parentElement)
            el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
    function onError(error: Error | string | unknown) {
        console.error(error);
        printError(error instanceof Error ? "unexpected error:" + error.message : error + '', false);
    }
    function isRecordingSupported() {
        const isUserMediaSupported = !!(window.navigator && window.navigator.mediaDevices && window.navigator.mediaDevices.getUserMedia);
        return AudioContext && isUserMediaSupported;
    }
})();
