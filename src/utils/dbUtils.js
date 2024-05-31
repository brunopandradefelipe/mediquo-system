function generateInsertSQL(tableName, data) {
    // Verifica se o objeto "data" é um objeto válido e não está vazio
    if (typeof data !== 'object' || data === null || Object.keys(data).length === 0) {
        throw new Error('O objeto de dados não é válido ou está vazio.');
    }

    // Monta a consulta SQL de inserção
    const keys = Object.keys(data);
    const columns = keys.join(', ');
    const values = keys.map((key, index) => `$${index + 1}`).join(', ');

    // Monta o array de valores (parâmetros preparados)
    const params = keys.map(key => data[key]);

    const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;

    // Retorna o objeto com o SQL e o array de valores
    return {
        sql,
        values: params,
    };
}

function generateUpdateSQL(tableName, data, id, columnId) {
    // Verifica se o objeto "data" é um objeto válido e não está vazio
    if (typeof data !== 'object' || data === null || Object.keys(data).length === 0) {
      throw new Error('O objeto de dados não é válido ou está vazio.');
    }
  
    // Monta a consulta SQL de atualização
    const keys = Object.keys(data);
    const columns = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
  
    // Monta o array de valores (parâmetros preparados)
    const params = keys.map(key => data[key]);
  
    // Adiciona o ID como último parâmetro preparado
    params.push(id);
  
    const sql = `UPDATE ${tableName} SET ${columns} WHERE ${columnId} = $${params.length} RETURNING *;`;
  
    // Retorna o objeto com o SQL e o array de valores
    return {
      sql,
      values: params,
    };
  }
  

module.exports = {
    generateInsertSQL,
    generateUpdateSQL,
};