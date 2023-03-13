import { WaveFile } from "wavefile";
export class WavRecorder {
    private sampleRate: number;
    private gain: number = 1;
    private gainNode?: GainNode;
    private stream?: MediaStream;
    private chunks: Float32Array[] = [];
    private processor?: ScriptProcessorNode;
    private recording = false;
    constructor(private audioContext: AudioContext) {
        this.sampleRate = audioContext.sampleRate;
    }
    setGain(gain: number) {
        this.gain = gain;
    }
    async start() {
        if (this.recording) throw new Error("Already recording");
        this.recording = true;
        await this.audioContext.resume();
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.gainNode = new GainNode(this.audioContext);
        this.gainNode.gain.value = this.gain;
        const microphone = this.audioContext.createMediaStreamSource(this.stream);
        microphone.connect(this.gainNode);
        let onRecordStart: Function | null = null;
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processor.addEventListener("audioprocess", ({ inputBuffer }) => {
            const inputData = inputBuffer.getChannelData(0);
            if (inputData.length) {
                if (onRecordStart != null) {
                    if (inputData.every(s => s == 0)) {
                        return;
                    }
                    onRecordStart();
                    onRecordStart = null;
                }
                this.chunks.push(new Float32Array(inputData));
            }
        });
        this.gainNode.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        return new Promise(resolve => onRecordStart = resolve);
    }
    async end() {
        if (!this.recording) throw new Error("No record");
        this.recording = false;
        this.stream?.getTracks().forEach(t => t.stop());
        if (this.gainNode && this.processor) {
            this.gainNode.disconnect();
            this.processor.disconnect();
        }
        const samples = this.chunks.reduce((acc, chunk) => {
            const result = new Float32Array(acc.length + chunk.length);
            result.set(acc);
            result.set(chunk, acc.length);
            return result;
        }, new Float32Array());
        this.chunks = [];
        return this.createWavFile(samples);
    }

    createWavFile(samples: Float32Array) {
        let wav = new WaveFile();
        wav.fromScratch(1, this.sampleRate, '32f', samples);
        return wav;
    }
}