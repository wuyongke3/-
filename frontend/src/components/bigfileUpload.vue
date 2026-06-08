<template>
    <div>
        <button disabled> 分片上传 </button>
        <p>大文件上传过程比较长，而且可能存在用户外部打断的情况，比如用户关闭浏览器、网络中断等</p>
        <p>为了确保文件上传的完整性和稳定性，建议在上传过程中添加断点续传功能（分片上传）</p>
        <input :multiple="isMultiple" type="file" @change="handleFileChange" />
        <span v-if="loading">
            上传中...
        </span>
        <button :disabled="loading" @click="handleUpload">上传</button>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'


const emit = defineEmits(['afterUploadFinish'])

const isMultiple = ref(false)
const fileList = ref<any>()

const loading = ref(false)

const handleFileChange = (e: any) => {
    fileList.value = e.target.files?.[0]
}

const handleUpload = async () => {
    if (!fileList.value) return
    // 开始上传
    beforeUpload()
    doUpload(fileList.value)
    // 结束上传
    emit('afterUploadFinish')
}

const doUpload = (file: File) => {
    const bigfileUploadWorker = new Worker(new URL('../worker/test.worker.ts', import.meta.url), {
        name: 'bigfileUploadWorker'
    });
    bigfileUploadWorker.postMessage({attement: file});
    bigfileUploadWorker.onmessage = (ev) => {
        console.log('worker 回传消息: ', ev.data)
    }
}


const beforeUpload = () => {
    
}

const afterUpload = ()=>{
    console.log(123)

}


</script>