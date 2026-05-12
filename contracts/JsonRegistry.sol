// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract JsonRegistry {
    struct RecordInput {
        string title;
        string body;
        string category;
        uint256 createdAt;
        bytes32 externalId;
    }

    struct Record {
        address sender;
        string title;
        string body;
        string category;
        uint256 createdAt;
        bytes32 externalId;
    }

    Record[] private records;

    event RecordRegistered(
        address indexed sender,
        string title,
        string body,
        string category,
        uint256 createdAt,
        bytes32 externalId
    );

    function registerRecord(RecordInput calldata input) external {
        require(bytes(input.title).length > 0, "title empty");
        require(bytes(input.body).length > 0, "body empty");

        records.push(
            Record({
                sender: msg.sender,
                title: input.title,
                body: input.body,
                category: input.category,
                createdAt: input.createdAt,
                externalId: input.externalId
            })
        );

        emit RecordRegistered(
            msg.sender,
            input.title,
            input.body,
            input.category,
            input.createdAt,
            input.externalId
        );
    }

    function getRecord(uint256 index)
        external
        view
        returns (
            address sender,
            string memory title,
            string memory body,
            string memory category,
            uint256 createdAt,
            bytes32 externalId
        )
    {
        Record memory r = records[index];
        return (
            r.sender,
            r.title,
            r.body,
            r.category,
            r.createdAt,
            r.externalId
        );
    }

    function getCount() external view returns (uint256) {
        return records.length;
    }
}