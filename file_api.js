import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { select, select1 } from 'xpath';
import { configurationCorePropertyMap, configurationCustomPropertyMap } from "./config.js";

export const parseDataSyncFile = function (filePath) {
    if (!existsSync(filePath)) {
        console.error("Data file not found");
        return;
    }

    const dataSyncFile = readFileSync(filePath, "utf8");
    const dataSyncXmlDoc = new DOMParser().parseFromString(dataSyncFile, "text/xml");

    const data = parseSyncXmlDoc(dataSyncXmlDoc);

    return data;
};

const parseSyncXmlDoc = function (dataSyncXmlDoc) {
    let project = {
        name: null,
        elements: [],
        deletedElements: []
    };

    project.name = select1("/project/@name", dataSyncXmlDoc).value;

    select("/project/elements/element", dataSyncXmlDoc).forEach(xmlElement => {
        let element = {
            guid: select1("@guid", xmlElement).value,
            name: select1("@name", xmlElement).value,
            type: select1("@type", xmlElement).value,
            variation: select1("@variation", xmlElement).value,
            zone: null,
            level: null,
            geometry: { x: 0, y: 0, elevation: 0, rotatingAngle: 0.0 },
            dimension: { width: 0, height: 0, depth: 0 },
            location: null,
            material: null,
            finish: null,
            mount: null,
            modiStamp: select1("@modiStamp", xmlElement).value,
            classification: {
                code: select1("@code", select1("classification", xmlElement)).value,
                name: select1("@name", select1("classification", xmlElement)).value
            },
            classificationGroup: {
                code: select1("@code", select1("classification-group", xmlElement)).value,
                name: select1("@name", select1("classification-group", xmlElement)).value
            },
            libraryPart: {
                index: select1("@index", select1("library-part", xmlElement)).value,
                documentName: select1("@documentName", select1("library-part", xmlElement)).value,
                uniqueId: select1("@uniqueId", select1("library-part", xmlElement)).value
            },
            token: {
                fungible: false,
                contractAddress: null,
                id: null
            },
            coreProperties: {},
            customProperties: {}
        };

        element.classification.full = (element.classification.code + ' ' + element.classification.name).trim();
        element.classificationGroup.full = (element.classificationGroup.code + ' ' + element.classificationGroup.name).trim();

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            element.coreProperties[corePtyGpName] = {};
            corePtyMap.forEach(corePtyName => {
                const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
                element.coreProperties[corePtyGpName][corePtyName] = corePtyNode == null ? null : corePtyNode.value;
            });
        });

        if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
            const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;
            element.customProperties[customPropertyGroupName] = {};

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    const customPtyNode = select1(`custom-property-groups/group[@name="${customPropertyGroupName}"]/property[@name="${customPtyName}"]/@value`, xmlElement);
                    element.customProperties[customPropertyGroupName][customPtyName] = customPtyNode == null ? null : customPtyNode.value;
                });
            }
        }

        project.elements.push(element);
    });

    select("/project/deleted-elements/element", dataSyncXmlDoc).forEach(xmlElement => {
        project.deletedElements.push(select1("@guid", xmlElement).value);
    });

    return project;
}