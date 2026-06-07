<template>
    <div>
        <h2>文件列表</h2>
        <button @click="handleRefresh">刷新</button>
        <ul>
            <li v-for="(item, index) in fileList" :key="item.filename">{{ index as number + 1 }}.
                <button @click="handleDownload(item)">{{ item.filename }}</button>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const fileList = ref<any>([])
onMounted(() => {
    handleRefresh()
})

const handleRefresh = async () => {
    const res = await fetch('http://localhost:3000/api/attement/list', {
        method: 'GET',
    })
    const data = await res.json()
    console.log(data)
    fileList.value = data.data || []
}

const handleDownload = async (item: any) => {
    const res = await fetch(`http://localhost:3000/api/attement/download?filename=${item.filename}`, {
        method: 'GET',
    })
    const data = await res.blob()
    console.log(data)
    const url = URL.createObjectURL(new Blob([data], { type: item.type }))
    const a = document.createElement('a')
    a.href = url
    a.download = item.filename
    a.click()
    URL.revokeObjectURL(url)
}
</script>