<template>
    <div>
        <button disabled> 普通上传 </button>
        <p>input file 浏览器原生标签支持的文件上传方式： 普通上传文件没有大小限制</p>
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