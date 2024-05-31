async function getUserByID(db, userId) {
    try {
        const result = await db.query(
            'SELECT a.first_name, a.last_name, a.email, b.prefix, a.phone, a.user_document, a.company_id, b.company_name, b.company_img, b.access_level FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1',
            [userId]
        );
        return result.rows;
    } catch (error) {
        console.error('Error querying user by ID:', error);
        throw error;
    }
}
async function getUserByIDLOG(db, userId) {
    try {
        const result = await db.query(
            'SELECT comp.company_name,comp.x_api_key, comp.x_secret_key, comp.prefix, comp.company_id, us.user_id FROM users us INNER JOIN companies comp ON us.company_id = comp.company_id WHERE us.user_id = $1',
            [userId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error querying user by ID:', error);
        throw error;
    }
}


module.exports = {
    getUserByID,
    getUserByIDLOG
};
