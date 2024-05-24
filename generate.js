import { homedir } from "os";
import { writeFileSync, appendFileSync } from "fs";
import { create } from 'xmlbuilder2';



const pageConfiguration = {
    id: "ss_30_10_30__85",
    type: "custom",
    name: "Roof Trusses",
    groupName: "Timber roof framing systems",
    uri: "/dashboard/custom3/ss_30_10_30__85",
    columns: [
        {
            key: "timberStrengthGrade",
            display: "Timber Strength Grade"
        },
        {
            key: "lorryNum",
            display: "Lorry No."
        },
        {
            key: "orderLoadingLorryFactory",
            display: "Order of Loading on Lorry at Factory"
        },
        {
            key: "panelErectionSequence",
            display: "Panel Erection Sequence"
        },
        {
            key: "fireResistance",
            display: "Fire Resistance"
        },
        {
            key: "flameSpreadRequirement",
            display: "Flame Spread Requirement"
        },
        {
            key: "spacing",
            display: "Spacing(mm)"
        },
        {
            key: "deadLoadRoof",
            display: "Dead Load Roof (on Slope, kN/m2)"
        },
        {
            key: "deadLoadCeiling",
            display: "Dead Load Ceiling (on Plan, KN/m2)"
        },
        {
            key: "snowLoad",
            display: "Snow Load (on Slope, KN/m2)"
        },
        {
            key: "liveLoadCeiling",
            display: "Live Load Ceiling (on Plan, KN/m2)"
        },
        {
            key: "liveLoadAttic",
            display: "Live Load Attic (on Plan, KN/m2)"
        },
        {
            key: "windLoad",
            display: "Wind Load (Velocity Pressure, KN/m2)"
        },
        {
            key: "tankLoad",
            display: "Tank Load (over 3 Trusses, L)"
        },
        {
            key: "hoistLoads",
            display: "Hoist Loads(kN)"
        },
        {
            key: "minBracingProfile",
            display: "Min. Bracing Profile"
        },
        {
            key: "minBracingLapping",
            display: "Min. Bracing Lapping"
        },
        {
            key: "unloadingMore95Kg",
            display: "Unloading >95Kg"
        },
        {
            key: "unloadingLess95Kg",
            display: "Unloading <95Kg"
        },
    ],
    "projectCode": "TKB"
};

let classificationTemplate = {
    "code": pageConfiguration.id.charAt(0).toUpperCase() + pageConfiguration.id.slice(1),
    "projectCode": pageConfiguration.projectCode,
    "template": {}
};

for (const column of pageConfiguration.columns) {
    classificationTemplate.template[column.key] = null;
}

const classification = {
    "code": pageConfiguration.id.charAt(0).toUpperCase() + pageConfiguration.id.slice(1),
    "name": pageConfiguration.groupName,
    "full": pageConfiguration.id.charAt(0).toUpperCase() + pageConfiguration.id.slice(1) + " " + pageConfiguration.groupName,
    "projectCode": pageConfiguration.projectCode
};

classification.parentCode = classification.code.split("_").slice(0, 3).join("_");
classification.groupCode = classification.code.split("_").slice(0, 2).join("_");

let privileges = [];
let roles = ["architect", "structural", "mechanical", "electrical", "plumbing", "procurement", "programmer"];


roles.forEach(role => {
    let privilege = {
        "role": role,
        "scope": "bim",
        "section": pageConfiguration.id,
        "fields": {}
    };

    for (const column of pageConfiguration.columns) {
        privilege.fields[column.key] = {
            "read": [
                "*"
            ],
            "write": [
            ]
        };
    }

    privileges.push(privilege);
});

let xmlObj = {
    custom: {
        "@name": classification.full,
        "@database-name": pageConfiguration.id,
        property: [
        ]
    }
};

for (const column of pageConfiguration.columns) {
    xmlObj.custom.property.push({
        "@name": column.display,
        "@database-name": column.key
    });
}

const dataFilePath = `${homedir()}/bohm/support/${pageConfiguration.id}.txt`;

writeFileSync(dataFilePath, "Page Configuration JSON:\n" + JSON.stringify(pageConfiguration, null, 2));
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "Classification Template JSON:\n" + JSON.stringify(classificationTemplate, null, 2));
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "Classification JSON (if necessary):\n" + JSON.stringify(classification, null, 2));
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "MongoDB query to patch correct classification name (if necessary):\n" + `db.classifications.updateOne({"code":"${classification.code}"}, {$set: {code: "${classification.code}", name: "${classification.name}", full: "${classification.full}", projectCode: "${classification.projectCode}", parentCode: "${classification.parentCode}", groupCode: "${classification.groupCode}"}})`)
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "MongoDB query to patch element for correct classification name (if necessary):\n" + `db.elements.updateMany({"classification.code":"${classification.code}"}, {$set: {classification: {code: "${classification.code}", name: "${classification.name}", full: "${classification.full}"}}})`);
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "Dummy privilege for all roles:\n" + JSON.stringify(privileges, null, 2));
appendFileSync(dataFilePath, "\n--------------------------------------------------\n");

appendFileSync(dataFilePath, "XML for add-on:");
appendFileSync(dataFilePath, create({ encoding: "UTF-8", standalone: false }, xmlObj).end({ prettyPrint: true }));