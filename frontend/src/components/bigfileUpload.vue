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


const isMultiple = ref(false)
const fileList = ref<any>()

const loading = ref(false)

const handleFileChange = (e: any) => {
    fileList.value = e.target.files?.[0]
}

const handleUpload = async () => {
    if (!fileList.value) return

    // 普通上传走 HTTP multipart/form-data
    const formData = new FormData()
    formData.append('file', fileList.value)
    formData.append('name', fileList.value.name)

    for (const [key, value] of formData.entries()) {
        console.log(key, value)
    }

    loading.value = true;
    try {
        const res = await fetch('http://localhost:3000/api/attement/upload', {
            method: 'POST',
            body: formData
        })
    } catch (error) {
        console.log(error)
    } finally {
        console.log('finally')
        loading.value = false;
    }
}

</script>