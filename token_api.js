import { homedir } from 'os';
import { DOMParser } from '@xmldom/xmldom'
import { readFileSync, writeFileSync } from 'fs';
import { select, select1 } from 'xpath';
import { configCorePtyMap, configCustomPtyMap } from './common.js';

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = `${homedir()}/bohm/service-account-token.json`;

async function parseExportDataIdOnly(exportXmlDoc) {

    let jsonObj = {
        project: {},
        elements: []
    };

    jsonObj.project.name = select1("/project/@name", exportXmlDoc).value;

    for (const element of select("/project/elements/element", exportXmlDoc)) {


        let jsonObjElem = {
            guid: select1("@guid", element).value
        };

        jsonObj.elements.push(jsonObjElem);
    }

    console.log(jsonObj.elements.length);

    return jsonObj;
}

async function parseExportData(exportXmlDoc) {

    let jsonObj = {
        project: {},
        elements: []
    };

    jsonObj.project.name = select1("/project/@name", exportXmlDoc).value;

    for (const element of select("/project/elements/element", exportXmlDoc)) {
        let elemClass = select1("classification", element);
        let elemClassGp = select1("classification-group", element);
        let elemClassGpCode = select1("@code", elemClassGp).value;
        let elemClassGpName = select1("@name", elemClassGp).value;
        let elemLibPart = select1("library-part", element);

        let jsonObjElem = {
            info: {
                guid: select1("@guid", element).value,
                name: select1("@name", element).value,
                type: select1("@type", element).value,
                variation: select1("@variation", element).value,
                modiStamp: select1("@modiStamp", element).value
            },
            libraryPart: {
                documentName: select1("@documentName", elemLibPart).value,
                fileName: select1("@fileName", elemLibPart).value,
                index: select1("@index", elemLibPart).value,
                uniqueId: select1("@uniqueId", elemLibPart).value
            },
            classification: {
                code: select1("@code", elemClass).value,
                name: select1("@name", elemClass).value
            },
            classificationGroup: {
                code: elemClassGpCode,
                name: select1("@name", elemClassGp).value
            },
            propertyGroups: {
                core: [],
                custom: []
            }
        };

        for (let corePtyGpName of Object.keys(configCorePtyMap)) {
            let jsonObjElemCorePtyGp = {
                name: corePtyGpName,
                properties: []
            };

            for (let corePtyName of configCorePtyMap[corePtyGpName]) {
                let elemCorePty = select1(`core-property-groups/group[@name='${corePtyGpName}']/property[@name='${corePtyName}']`, element);
                if (elemCorePty != null) {
                    jsonObjElemCorePtyGp.properties.push({
                        name: corePtyName,
                        value: select1("@value", elemCorePty).value
                    });
                } else {
                    // jsonObjElemCorePtyGp.properties.push({
                    //     name: corePtyName,
                    //     value: null
                    // });
                }
            }

            jsonObjElem.propertyGroups.core.push(jsonObjElemCorePtyGp);
        }



        let elemCustomPtyGpName = `${elemClassGpCode} ${elemClassGpName}`;

        if (Object.keys(configCustomPtyMap).includes(elemCustomPtyGpName)) {
            let jsonObjElemCustomPtyGp = {
                name: elemCustomPtyGpName,
                properties: []
            };

            for (let customPtyName of configCustomPtyMap[elemCustomPtyGpName]) {
                let elemCustomPty = select1(`custom-property-groups/group[@name='${elemCustomPtyGpName}']/property[@name='${customPtyName}']`, element);
                if (elemCustomPty != null) {
                    jsonObjElemCustomPtyGp.properties.push({
                        name: customPtyName,
                        value: select1("@value", elemCustomPty).value
                    });
                } else {
                    // jsonObjElemCustomPtyGp.properties.push({
                    //     name: customPtyName,
                    //     value: null
                    // });
                }
            }

            jsonObjElem.propertyGroups.custom.push(jsonObjElemCustomPtyGp);
        }

        jsonObj.elements.push(jsonObjElem);
    }

    return jsonObj;
}

async function main() {

    const readData = readFileSync(homedir() + '/bohm/files/add-on-export-data.xml', 'utf8');

    const doc = new DOMParser().parseFromString(readData, 'text/xml');

    const jsonObj = await parseExportData(doc);

    writeFileSync(homedir() + '/bohm/files/add-on-export-data.json', JSON.stringify(jsonObj, null, 2));
}

main().catch(console.error);
