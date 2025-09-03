export const childrenService = {
  getAll: async () => {
    const response = await api.get('/api/children');
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/api/children/${id}`);
    return response.data;
  },
  
  create: async (childData) => {
    const response = await api.post('/api/children', childData);
    return response.data;
  },

  // NUEVAS FUNCIONES ↓
  update: async (id, childData) => {
    const response = await api.put(`/api/children/${id}`, childData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/api/children/${id}`);
    return response.data;
  },
};