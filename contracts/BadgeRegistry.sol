// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BadgeRegistry {
    struct RecordInput {
        string context;
        string id;
        string identity;
        string badge;
        uint256 issuedOn;
        string badgeName;
        string issuerName;
        string batchId;
    }

    struct Record {
        string context;
        string id;
        string identity;
        string badge;
        uint256 issuedOn;
        string badgeName;
        string issuerName;
        string batchId;
    }

    Record[] private records;

    event RecordRegistered(
        string context,
        string id,
        string identity,
        string badge,
        uint256 issuedOn,
        string badgeName,
        string issuerName,
        string batchId
    );

    function registerRecord(RecordInput calldata input) external {
        require(bytes(input.context).length > 0, "context empty");
        require(bytes(input.id).length > 0, "id empty");
        require(bytes(input.identity).length > 0, "identity empty");
        require(bytes(input.badge).length > 0, "badge empty");
        require(input.issuedOn > 0, "issuedOn empty");
        require(bytes(input.badgeName).length > 0, "badgeName empty");
        require(bytes(input.issuerName).length > 0, "issuerName empty");
        require(bytes(input.batchId).length > 0, "batchId empty");

        records.push(
            Record({
                context: input.context,
                id: input.id,
                identity: input.identity,
                badge: input.badge,
                issuedOn: input.issuedOn,
                badgeName: input.badgeName,
                issuerName: input.issuerName,
                batchId: input.batchId
            })
        );

        emit RecordRegistered(
            input.context,
            input.id,
            input.identity,
            input.badge,
            input.issuedOn,
            input.badgeName,
            input.issuerName,
            input.batchId
        );
    }

    function getRecord(uint256 index)
        external
        view
        returns (
            string memory context,
            string memory id,
            string memory identity,
            string memory badge,
            uint256 issuedOn,
            string memory badgeName,
            string memory issuerName,
            string memory batchId
        )
    {
        Record memory r = records[index];
        return (
            r.context,
            r.id,
            r.identity,
            r.badge,
            r.issuedOn,
            r.badgeName,
            r.issuerName,
            r.batchId        
        );
    }

    function getCount() external view returns (uint256) {
        return records.length;
    }
}