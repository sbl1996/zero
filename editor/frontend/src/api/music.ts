import axios from 'axios'

const API_BASE = 'http://localhost:8000/api/music'

export const musicApi = {
  async list() {
    const { data } = await axios.get(API_BASE)
    return data
  },

  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await axios.post(`${API_BASE}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async delete(filename: string) {
    const { data } = await axios.delete(
      `${API_BASE}/${encodeURIComponent(filename)}`
    )
    return data
  },

  getStreamUrl(filename: string) {
    return `${API_BASE}/${encodeURIComponent(filename)}/stream`
  },
}
