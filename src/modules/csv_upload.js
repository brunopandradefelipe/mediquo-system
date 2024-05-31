async function insertDataIntoCsvUpload(db,data) {
    try {
        // Extracting values from the data object
        const {
            rota,
            status,
            x_secret_key,
            x_api_key,
            prefix,
            company_id,
            acao,
            user_id,
            mensagem,
        } = data;

        // Executing the insert query with parameterized values
        const result = await db.query(
            `INSERT INTO public.csv_upload 
        (rota, status, secret_key, apk_key, prefixo, company_id, acao, user_id, mensagem) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) `,
            [rota, status, x_secret_key, x_api_key, prefix, company_id, acao, user_id, mensagem]
        );
    } catch (error) {
        console.error('Error inserting data into csv_upload:', error);
        throw error;
    } finally {

    }
}


module.exports = {
    insertDataIntoCsvUpload,
};
