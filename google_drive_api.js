
export const grantPermission = async function (service, spreadSheet) {
    let success = true;

    await service.permissions.create({
        resource: {
            type: 'user',
            role: 'writer',
            emailAddress: 'google-sheets-user@sincere-bay-406415.iam.gserviceaccount.com'
        },
        fileId: spreadSheet,
        fields: 'id'
    });

    await service.permissions.create({
        resource: {
            type: 'domain',
            role: 'writer',
            domain: 'workltd.co.uk'
        },
        fileId: spreadSheet,
        fields: 'id'
    });

    return success;
};